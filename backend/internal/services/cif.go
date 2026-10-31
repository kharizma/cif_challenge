package services

import (
	"context"
	"errors"
	"log/slog"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgconn"

	"cif-backend/internal/models"
	"cif-backend/internal/repository"
)

// CheckInput is the /api/cif/check request body.
type CheckInput struct {
	FullName        string `json:"full_name"`
	NIK             string `json:"nik"`
	DOB             string `json:"dob"`
	Phone           string `json:"phone"`
	MaritalStatus   string `json:"marital_status"`
	SpouseForgotten bool   `json:"spouse_forgotten"`
	SpouseName      string `json:"spouse_name"`
	LoanType        string `json:"loan_type"`
	LoanAmount      int64  `json:"loan_amount"`
	LoanTenorMonths int    `json:"loan_tenor_months"`
}

// ValidationError carries per-field messages for a 400 response.
type ValidationError struct{ Fields map[string]string }

func (e *ValidationError) Error() string { return "validation failed" }

var (
	namePattern  = regexp.MustCompile(`^[A-Za-z .,'-]+$`)
	nikPattern   = regexp.MustCompile(`^\d{16}$`)
	phonePattern = regexp.MustCompile(`^(\+628|628|08)\d{8,11}$`)
	phoneStrip   = strings.NewReplacer(" ", "", "-", "")
	maritalSet   = map[string]bool{"BELUM_KAWIN": true, "KAWIN": true, "CERAI": true}
	loanTypeSet  = map[string]bool{"KTA": true, "KPR": true, "KKB": true, "MODAL_KERJA": true}
	tenorSet     = map[int]bool{6: true, 12: true, 24: true, 36: true, 48: true, 60: true}
)

// Validate mirrors the customer table checks so errors return as JSON, not DB failures.
func (in *CheckInput) Validate(today time.Time) error {
	fields := map[string]string{}
	name := strings.TrimSpace(in.FullName)
	if len(name) < 3 || len(name) > 100 {
		fields["full_name"] = "Nama lengkap harus 3-100 karakter."
	} else if !namePattern.MatchString(name) {
		fields["full_name"] = "Hanya huruf, spasi, titik, koma, apostrof, dan tanda hubung."
	}

	nik := NormalizeNIK(in.NIK)
	if !nikPattern.MatchString(nik) {
		fields["nik"] = "NIK harus tepat 16 digit angka."
	}

	dob, err := time.Parse("2006-01-02", strings.TrimSpace(in.DOB))
	if err != nil {
		fields["dob"] = "Tanggal lahir harus format YYYY-MM-DD."
	} else if dob.After(today) {
		fields["dob"] = "Tanggal lahir tidak boleh di masa depan."
	}

	if in.Phone != "" && !phonePattern.MatchString(phoneStrip.Replace(in.Phone)) {
		fields["phone"] = "Nomor HP harus diawali 08, 628, atau +628, lalu 8-11 digit."
	}
	if !maritalSet[in.MaritalStatus] {
		fields["marital_status"] = "Status perkawinan harus BELUM_KAWIN, KAWIN, atau CERAI."
	}
	spouse := strings.TrimSpace(in.SpouseName)
	if in.SpouseForgotten && spouse != "" {
		fields["spouse_name"] = "Nama pasangan harus kosong jika lupa."
	}
	if spouse != "" {
		if in.MaritalStatus != "KAWIN" {
			fields["spouse_name"] = "Nama pasangan hanya untuk status KAWIN."
		} else if len(spouse) > 50 {
			fields["spouse_name"] = "Nama pasangan maksimal 50 karakter."
		} else if !namePattern.MatchString(spouse) {
			fields["spouse_name"] = "Hanya huruf, spasi, titik, koma, apostrof, dan tanda hubung."
		}
	}
	if !loanTypeSet[in.LoanType] {
		fields["loan_type"] = "Jenis kredit harus KTA, KPR, KKB, atau MODAL_KERJA."
	}
	if in.LoanAmount < 5_000_000 || in.LoanAmount > 500_000_000 {
		fields["loan_amount"] = "Jumlah pinjaman Rp5.000.000 sampai Rp500.000.000."
	}
	if !tenorSet[in.LoanTenorMonths] {
		fields["loan_tenor_months"] = "Tenor harus 6, 12, 24, 36, 48, atau 60 bulan."
	}

	if len(fields) > 0 {
		return &ValidationError{Fields: fields}
	}
	return nil
}

// StatusFor applies the agreed decision rule.
func StatusFor(hasCandidate bool, confidence, score float64, hasScore bool) (status, reason string) {
	switch {
	case !hasCandidate:
		return "NOT PASS", "NO_CANDIDATE"
	case confidence < 70:
		return "NOT PASS", "LOW_IDENTITY_CONFIDENCE"
	case !hasScore || score < 50:
		return "NOT PASS", "LOW_CREDIT_SCORE"
	case confidence >= 90 && score >= 80:
		return "PASS", "MATCH"
	default:
		return "REFER", "MANUAL_REVIEW"
	}
}

// CifService orchestrates validation, matching, scoring and persistence.
type CifService struct {
	customers *repository.CustomerRepository
	external  *External
	now       func() time.Time
}

func NewCifService(customers *repository.CustomerRepository, external *External) *CifService {
	return &CifService{customers: customers, external: external, now: time.Now}
}

// Check runs one application end to end and returns the stored row plus the scoring result.
func (s *CifService) Check(ctx context.Context, in CheckInput) (*models.Customer, *ScoringResult, error) {
	now := s.now().UTC()
	if err := in.Validate(now); err != nil {
		return nil, nil, err
	}

	candidates, err := s.external.CustomerInfo(ctx)
	if err != nil {
		slog.Error("customer information API failed", "error", err)
		return nil, nil, err
	}

	input := MatchInput{
		NIK:        NormalizeNIK(in.NIK),
		FullName:   in.FullName,
		DOB:        in.DOB,
		Phone:      in.Phone,
		SpouseName: in.SpouseName,
		HasPhone:   in.Phone != "",
		HasSpouse:  in.SpouseName != "" && !in.SpouseForgotten,
	}
	best, confidence := BestCandidate(input, candidates)

	applicationID, err := s.customers.NextApplicationID(ctx, "APP-"+now.Format("20060102")+"-")
	if err != nil {
		slog.Error("failed to generate application id", "error", err)
		return nil, nil, err
	}

	var scoring *ScoringResult
	if best != nil {
		scoring, err = s.external.Score(ctx, ScoringRequest{
			NoCIF:              best.NoCIF,
			ApplicationID:      applicationID,
			NIK:                input.NIK,
			IdentityConfidence: confidence,
		})
		if err != nil {
			slog.Error("scoring API failed", "error", err)
			return nil, nil, err
		}
	}
	hasScore := scoring != nil && scoring.HasScore
	score := 0.0
	if hasScore {
		score = scoring.Score
	}

	status, reason := StatusFor(best != nil, confidence, score, hasScore)

	dob, _ := time.Parse("2006-01-02", strings.TrimSpace(in.DOB))
	customer := &models.Customer{
		FullName:           strings.TrimSpace(in.FullName),
		DOB:                dob,
		MaritalStatus:      in.MaritalStatus,
		SpouseForgotten:    in.SpouseForgotten,
		LoanType:           in.LoanType,
		LoanAmount:         in.LoanAmount,
		LoanTenorMonths:    in.LoanTenorMonths,
		Status:             &status,
		Reason:             &reason,
		IdentityConfidence: &confidence,
		ApplicationID:      &applicationID,
	}
	if in.Phone != "" {
		phone := NormalizePhone(in.Phone)
		customer.Phone = &phone
	}
	if input.HasSpouse {
		spouse := strings.TrimSpace(in.SpouseName)
		customer.SpouseName = &spouse
	}
	if best != nil {
		customer.MatchedNoCIF = &best.NoCIF
	}
	if hasScore {
		customer.CreditScore = &score
		customer.Decision = &scoring.Grade
	}

	// Retry when a concurrent request took the same application id.
	for attempt := 0; attempt < 3; attempt++ {
		err = s.customers.Create(ctx, customer)
		if err == nil {
			return customer, scoring, nil
		}
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
			break
		}
		nextID, idErr := s.customers.NextApplicationID(ctx, "APP-"+now.Format("20060102")+"-")
		if idErr != nil {
			break
		}
		applicationID = nextID
		customer.ApplicationID = &applicationID
	}
	slog.Error("failed to save application", "error", err)
	return nil, nil, err
}

// List returns one page of applications.
func (s *CifService) List(ctx context.Context, page, limit int) ([]models.Customer, int64, error) {
	return s.customers.List(ctx, page, limit)
}

// Get returns an application and its documents.
func (s *CifService) Get(ctx context.Context, applicationID string) (*models.Customer, error) {
	return s.customers.FindByApplicationID(ctx, applicationID)
}
