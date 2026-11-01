package services

import (
	"testing"
	"time"
)

func TestNormalizeName(t *testing.T) {
	cases := map[string]string{
		"Hj. Dewi Lestari, S.E.": "dewi lestari",
		"  BUDI   Santoso ":      "budi santoso",
		"Dr. Ir. Andi S.Kom.":    "andi",
	}
	for input, want := range cases {
		if got := NormalizeName(input); got != want {
			t.Errorf("NormalizeName(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestNormalizePhone(t *testing.T) {
	cases := map[string]string{
		"+62 812-3456-7890": "6281234567890",
		"081234567890":      "6281234567890",
		"6281234567890":     "6281234567890",
	}
	for input, want := range cases {
		if got := NormalizePhone(input); got != want {
			t.Errorf("NormalizePhone(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestConfidenceWeights(t *testing.T) {
	candidate := Candidate{
		NoCIF:      "8100000001",
		NIK:        "3171011504900001",
		FullName:   "Budi Santoso",
		DOB:        "1990-04-15",
		Phones:     []Phone{{Number: "6281234567890", Status: "ACTIVE"}},
		SpouseName: "Siti Aminah",
	}
	input := MatchInput{
		NIK: "3171011504900001", FullName: "Budi Santoso", DOB: "1990-04-15",
		Phone: "+62 812-3456-7890", HasPhone: true,
		SpouseName: "Siti Aminah", HasSpouse: true,
	}
	if got := Confidence(input, candidate); got != 100 {
		t.Fatalf("exact match confidence = %v, want 100", got)
	}

	// Without phone and spouse only the mandatory fields count; NIK is one digit off.
	input.HasPhone, input.HasSpouse = false, false
	input.NIK = "3171011504900002"
	want := (30*0.9 + 25*1 + 15*1) / 70.0 * 100
	if got := Confidence(input, candidate); got != round2(want) {
		t.Fatalf("conditional confidence = %v, want %v", got, round2(want))
	}
}

func TestDOBSwap(t *testing.T) {
	if got := dobScore("1990-04-15", "1990-04-15"); got != 1 {
		t.Fatalf("same dob = %v", got)
	}
	if got := dobScore("1990-04-15", "1990-15-04"); got != 0 {
		t.Fatalf("invalid swapped dob = %v", got)
	}
	if got := dobScore("1990-04-15", "1990-04-15"); got != 1 {
		t.Fatalf("same dob = %v", got)
	}
}

func TestStatusFor(t *testing.T) {
	cases := []struct {
		hasCandidate bool
		confidence   float64
		score        float64
		hasScore     bool
		status       string
		reason       string
	}{
		{false, 0, 0, false, "NOT PASS", "CIF_NOT_FOUND"},
		{true, 69.99, 90, true, "NOT PASS", "LOW_IDENTITY_CONFIDENCE"},
		{true, 95, 49, true, "NOT PASS", "LOW_CREDIT_SCORE"},
		{true, 95, 0, false, "NOT PASS", "LOW_CREDIT_SCORE"},
		{true, 90, 80, true, "PASS", "MATCH"},
		{true, 89.99, 100, true, "REFER", "MANUAL_REVIEW"},
		{true, 95, 79.99, true, "REFER", "MANUAL_REVIEW"},
	}
	for _, c := range cases {
		status, reason := StatusFor(c.hasCandidate, c.confidence, c.score, c.hasScore)
		if status != c.status || reason != c.reason {
			t.Errorf("StatusFor(%v,%v,%v,%v) = %s/%s, want %s/%s", c.hasCandidate, c.confidence, c.score, c.hasScore, status, reason, c.status, c.reason)
		}
	}
}

func TestValidateInput(t *testing.T) {
	valid := CheckInput{
		FullName: "Budi Santoso", NIK: "3171011504900001", DOB: "1990-04-15",
		Phone: "081234567890", MaritalStatus: "KAWIN", SpouseName: "Siti Aminah",
		LoanType: "KTA", LoanAmount: 10_000_000, LoanTenorMonths: 12,
	}
	if err := valid.Validate(time.Now()); err != nil {
		t.Fatalf("valid input rejected: %v", err)
	}

	invalid := valid
	invalid.FullName = "B"
	invalid.NIK = "123"
	invalid.Phone = "12345"
	invalid.SpouseForgotten = true
	invalid.LoanAmount = 1
	err := invalid.Validate(time.Now())
	fields, ok := err.(*ValidationError)
	if !ok {
		t.Fatalf("expected ValidationError, got %v", err)
	}
	for _, key := range []string{"full_name", "nik", "phone", "spouse_name", "loan_amount"} {
		if fields.Fields[key] == "" {
			t.Errorf("missing validation error for %s", key)
		}
	}
}

func round2(value float64) float64 {
	return float64(int(value*100+0.5)) / 100
}
