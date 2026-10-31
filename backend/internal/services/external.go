package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"cif-backend/internal/cache"
)

// ErrCustomerInfo and ErrScoring mark failures that should surface as 503.
var (
	ErrCustomerInfo = errors.New("customer information service unavailable")
	ErrScoring      = errors.New("scoring service unavailable")
)

const customerInfoCacheKey = "cif:customer-information"

// External calls the two Beeceptor APIs and caches the customer list.
type External struct {
	customerInfoURL string
	scoringURL      string
	cache           cache.Store
	ttl             time.Duration
	client          *http.Client
}

func NewExternal(customerInfoURL, scoringURL string, store cache.Store, ttl time.Duration) *External {
	return &External{
		customerInfoURL: customerInfoURL,
		scoringURL:      scoringURL,
		cache:           store,
		ttl:             ttl,
		client:          &http.Client{Timeout: 15 * time.Second},
	}
}

// CustomerInfo returns the candidate list, from cache when it is still fresh.
func (e *External) CustomerInfo(ctx context.Context) ([]Candidate, error) {
	if cached, err := e.cache.Get(ctx, customerInfoCacheKey); err == nil && cached != nil {
		var candidates []Candidate
		if err := json.Unmarshal(cached, &candidates); err == nil {
			return candidates, nil
		}
		slog.Warn("ignoring corrupt customer information cache")
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, e.customerInfoURL, nil)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrCustomerInfo, err)
	}
	response, err := e.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrCustomerInfo, err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w: status %d", ErrCustomerInfo, response.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(response.Body, 8<<20))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrCustomerInfo, err)
	}
	var candidates []Candidate
	if err := json.Unmarshal(body, &candidates); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrCustomerInfo, err)
	}
	if err := e.cache.Set(ctx, customerInfoCacheKey, body, e.ttl); err != nil {
		slog.Warn("failed to cache customer information", "error", err)
	}
	return candidates, nil
}

// ScoringRequest matches the Scoring API payload.
type ScoringRequest struct {
	NoCIF              string  `json:"NO_CIF"`
	ApplicationID      string  `json:"application_id"`
	NIK                string  `json:"nik"`
	IdentityConfidence float64 `json:"identity_confidence"`
}

// ScoringResult is a normalized Scoring API response.
type ScoringResult struct {
	NoCIF       string
	Score       float64
	HasScore    bool
	Grade       string
	ReasonCodes []string
}

type scoringResponse struct {
	NoCIF       string   `json:"NO_CIF"`
	Score       *string  `json:"score"`
	Grade       string   `json:"grade"`
	ReasonCodes []string `json:"reason_codes"`
	Error       string   `json:"error"`
}

// Score posts one application to the Scoring API.
func (e *External) Score(ctx context.Context, payload ScoringRequest) (*ScoringResult, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrScoring, err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, e.scoringURL, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrScoring, err)
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := e.client.Do(request)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrScoring, err)
	}
	defer response.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrScoring, err)
	}
	var decoded scoringResponse
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return nil, fmt.Errorf("%w: status %d", ErrScoring, response.StatusCode)
	}
	if response.StatusCode != http.StatusOK || decoded.Error != "" {
		return nil, fmt.Errorf("%w: %s", ErrScoring, decoded.Error)
	}

	result := &ScoringResult{NoCIF: decoded.NoCIF, Grade: decoded.Grade, ReasonCodes: decoded.ReasonCodes}
	if decoded.Score != nil && *decoded.Score != "" {
		score, err := strconv.ParseFloat(*decoded.Score, 64)
		if err != nil {
			return nil, fmt.Errorf("%w: invalid score %q", ErrScoring, *decoded.Score)
		}
		result.Score, result.HasScore = score, true
	}
	return result, nil
}
