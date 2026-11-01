package services

import (
	"encoding/json"
	"os"
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
	want := (35*0.9 + 25*1 + 15*1) / 75.0 * 100
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

func TestComparisonCases(t *testing.T) {
	nameCases := []struct {
		input, candidate string
		want             float64
	}{
		{"Siti Nur Haliza", "Siti Nurhaliza", 1.0},
		{"Hj. Dewi Lestari, S.E.", "Dewi Lestari", 1.0},
		{"Fajar Nugraha", "Fajar Nugroho", 1.0},
	}
	for _, c := range nameCases {
		if got := nameScore(c.input, c.candidate); got != c.want {
			t.Errorf("nameScore(%q, %q) = %v, want %v", c.input, c.candidate, got, c.want)
		}
	}

	if got := phoneScore("+62 812-3456-7890", []Phone{{Number: "081234567890"}}); got != 1.0 {
		t.Errorf("phoneScore normalized = %v, want 1.0", got)
	}
	if got := nikScore("3171011504900001", "3171011504900002"); got != 0.9 {
		t.Errorf("nikScore distance 1 = %v, want 0.9", got)
	}
	if got := dobScore("1993-06-10", "1993-10-06"); got != 0.8 {
		t.Errorf("dobScore swapped = %v, want 0.8", got)
	}
}

func TestCandidateFilter(t *testing.T) {
	candidates := []Candidate{
		{NoCIF: "A", NIK: "3171011504900001", FullName: "Budi Santoso", DOB: "1990-04-15"},
		{NoCIF: "B", NIK: "3171011504900011", FullName: "Budi Santosa", DOB: "1990-04-15"},
		{NoCIF: "C", NIK: "9999999999999999", FullName: "Orang Lain", DOB: "1980-01-01", Phones: []Phone{{Number: "6281200000000"}}},
		{NoCIF: "D", NIK: "8888888888888888", FullName: "Jauh Sekali", DOB: "1980-01-01"},
	}
	input := MatchInput{NIK: "3171011504900001", FullName: "Joko Prasetyo", DOB: "1991-01-01", Phone: "081200000000", HasPhone: true}
	pool := candidatePool(input, candidates)
	got := map[string]bool{}
	for _, candidate := range pool {
		got[candidate.NoCIF] = true
	}
	if !got["A"] || !got["B"] || !got["C"] || got["D"] {
		t.Fatalf("candidate pool = %v, want A (NIK distance 0), B (NIK distance 1), C (phone match)", got)
	}
}

func TestCandidatePoolCap(t *testing.T) {
	candidates := make([]Candidate, 0, 8)
	niks := []string{
		"3171011504900001", "3171011504900002", "3171011504900003", "3171011504900004",
		"3171011504900005", "3171011504900006", "3171011504900007", "3171011504900008",
	}
	for i, nik := range niks {
		candidates = append(candidates, Candidate{NoCIF: string(rune('A' + i)), NIK: nik, FullName: "Nama", DOB: "1990-01-01"})
	}
	pool := candidatePool(MatchInput{NIK: niks[0], FullName: "Nama", DOB: "1990-01-01"}, candidates)
	if len(pool) != 5 {
		t.Fatalf("pool size = %d, want 5", len(pool))
	}
	for i := 0; i < 5; i++ {
		want := string(rune('A' + i))
		if pool[i].NoCIF != want {
			t.Fatalf("pool[%d] = %s, want %s", i, pool[i].NoCIF, want)
		}
	}
}

func TestNoCandidate(t *testing.T) {
	best, confidence := BestCandidate(MatchInput{NIK: "3174052208910005", FullName: "Rudi Hartono", DOB: "1991-08-22"}, []Candidate{
		{NoCIF: "A", NIK: "3171011504900001", FullName: "Budi Santoso", DOB: "1990-04-15"},
	})
	if best != nil || confidence != 0 {
		t.Fatalf("BestCandidate = %v/%v, want nil/0", best, confidence)
	}
}

func TestTestMDConfidence(t *testing.T) {
	raw, err := os.ReadFile("../../../kandidat_cif_100.json")
	if err != nil {
		t.Fatalf("read candidates: %v", err)
	}
	var candidates []Candidate
	if err := json.Unmarshal(raw, &candidates); err != nil {
		t.Fatalf("parse candidates: %v", err)
	}
	cases := []struct {
		input    MatchInput
		wantCIF  string
		wantConf float64
	}{
		{MatchInput{NIK: "3273022002880003", FullName: "Andi Pratama", DOB: "1988-02-20", Phone: "0857-1111-2222", HasPhone: true}, "8100000003", 100},
		{MatchInput{NIK: "3173051403870300", FullName: "Fajar Nugroho", DOB: "1987-03-14", Phone: "081200000000", HasPhone: true, SpouseName: "Wulan Rahayu", HasSpouse: true}, "8100000019", 85},
		{MatchInput{NIK: "3171011504900001", FullName: "Joko Prasetyo", DOB: "1991-01-01"}, "8100000001", 64.46},
		{MatchInput{NIK: "3578016107950004", FullName: "Dewi Lestari", DOB: "1995-07-21", Phone: "+62 878-5555-4444", HasPhone: true, SpouseName: "Rahmat Hidayat", HasSpouse: true}, "8100000004", 100},
	}
	for _, c := range cases {
		best, confidence := BestCandidate(c.input, candidates)
		if best == nil {
			t.Fatalf("%s: no candidate", c.input.FullName)
		}
		if best.NoCIF != c.wantCIF || confidence != c.wantConf {
			t.Errorf("%s: got %s/%.2f, want %s/%.2f", c.input.FullName, best.NoCIF, confidence, c.wantCIF, c.wantConf)
		}
	}
}
