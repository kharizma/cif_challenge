package services

import (
	"log/slog"
	"math"
	"regexp"
	"sort"
	"strings"
	"time"
)

// Candidate is one record from the Customer Information API.
type Candidate struct {
	NoCIF         string   `json:"NO_CIF"`
	NIK           string   `json:"nik"`
	FullName      string   `json:"full_name"`
	DOB           string   `json:"dob"`
	Gender        string   `json:"gender"`
	MaritalStatus string   `json:"marital_status"`
	SpouseName    string   `json:"spouse_name"`
	Phones        []Phone  `json:"phones"`
	Flags         []string `json:"flags"`
}

// Phone is a candidate phone entry.
type Phone struct {
	Number string `json:"number"`
	Status string `json:"status"`
}

// MatchInput is the subset of the form that identity confidence compares.
type MatchInput struct {
	NIK        string
	FullName   string
	DOB        string
	Phone      string
	SpouseName string
	HasPhone   bool
	HasSpouse  bool
}

var (
	titleWords = map[string]bool{"hj": true, "h": true, "dr": true, "ir": true, "se": true, "skom": true, "mt": true, "st": true, "sh": true, "mm": true, "msi": true, "spd": true}
	namePunct  = strings.NewReplacer(".", "", ",", "")
	spaceRe    = regexp.MustCompile(`\s+`)
	digitsRe   = regexp.MustCompile(`\D`)
)

// NormalizeName lowercases a name, drops punctuation and titles, and collapses spaces.
func NormalizeName(value string) string {
	fields := strings.Fields(strings.ToLower(value))
	kept := make([]string, 0, len(fields))
	for _, field := range fields {
		// Drop dots and commas so "S.E." and "S.E" both become the title "se".
		cleaned := namePunct.Replace(field)
		if cleaned == "" || titleWords[cleaned] {
			continue
		}
		kept = append(kept, cleaned)
	}
	return strings.Join(kept, " ")
}

// NormalizePhone keeps digits and rewrites a leading 0 to 62.
func NormalizePhone(value string) string {
	digits := digitsRe.ReplaceAllString(value, "")
	if strings.HasPrefix(digits, "0") {
		return "62" + digits[1:]
	}
	return digits
}

// NormalizeNIK removes spaces and requires exactly 16 digits.
func NormalizeNIK(value string) string {
	return spaceRe.ReplaceAllString(value, "")
}

func levenshtein(a, b string) int {
	ar, br := []rune(a), []rune(b)
	if len(ar) == 0 {
		return len(br)
	}
	prev := make([]int, len(br)+1)
	curr := make([]int, len(br)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(ar); i++ {
		curr[0] = i
		for j := 1; j <= len(br); j++ {
			cost := 1
			if ar[i-1] == br[j-1] {
				cost = 0
			}
			curr[j] = min(prev[j]+1, min(curr[j-1]+1, prev[j-1]+cost))
		}
		prev, curr = curr, prev
	}
	return prev[len(br)]
}

func jaro(a, b string) float64 {
	ar, br := []rune(a), []rune(b)
	if len(ar) == 0 && len(br) == 0 {
		return 1
	}
	if len(ar) == 0 || len(br) == 0 {
		return 0
	}
	window := max(len(ar), len(br))/2 - 1
	if window < 0 {
		window = 0
	}
	aMatched := make([]bool, len(ar))
	bMatched := make([]bool, len(br))
	matches := 0
	for i := range ar {
		start := max(0, i-window)
		end := min(len(br)-1, i+window)
		for j := start; j <= end; j++ {
			if bMatched[j] || ar[i] != br[j] {
				continue
			}
			aMatched[i], bMatched[j] = true, true
			matches++
			break
		}
	}
	if matches == 0 {
		return 0
	}
	transpositions := 0
	j := 0
	for i := range ar {
		if !aMatched[i] {
			continue
		}
		for !bMatched[j] {
			j++
		}
		if ar[i] != br[j] {
			transpositions++
		}
		j++
	}
	m := float64(matches)
	return (m/float64(len(ar)) + m/float64(len(br)) + (m-float64(transpositions)/2)/m) / 3
}

func jaroWinkler(a, b string) float64 {
	score := jaro(a, b)
	ar, br := []rune(a), []rune(b)
	prefix := 0
	for prefix < min(4, min(len(ar), len(br))) && ar[prefix] == br[prefix] {
		prefix++
	}
	return score + float64(prefix)*0.1*(1-score)
}

// nameScore returns 1.0 for Jaro-Winkler >= 0.92, otherwise the raw score.
func nameScore(a, b string) float64 {
	score := jaroWinkler(NormalizeName(a), NormalizeName(b))
	if score >= 0.92 {
		return 1
	}
	return score
}

func dobScore(input, candidate string) float64 {
	in, errIn := time.Parse("2006-01-02", strings.TrimSpace(input))
	can, errCan := time.Parse("2006-01-02", strings.TrimSpace(candidate))
	if errIn != nil || errCan != nil {
		return 0
	}
	if in.Equal(can) {
		return 1
	}
	// Same year with day and month swapped still counts as a near match.
	if in.Year() == can.Year() && in.Day() == int(can.Month()) && int(in.Month()) == can.Day() {
		return 0.8
	}
	return 0
}

func nikScore(input, candidate string) float64 {
	switch levenshtein(NormalizeNIK(input), NormalizeNIK(candidate)) {
	case 0:
		return 1
	case 1:
		return 0.9
	default:
		return 0
	}
}

func phoneScore(input string, phones []Phone) float64 {
	if len(phones) == 0 {
		return 0
	}
	target := NormalizePhone(input)
	best := -1
	for _, phone := range phones {
		distance := levenshtein(target, NormalizePhone(phone.Number))
		if best < 0 || distance < best {
			best = distance
		}
	}
	if best <= 1 {
		return 1
	}
	return 0
}

// Confidence scores one candidate against the form and returns a 0-100 value.
// Only NIK, name and DOB are always counted; phone and spouse are conditional.
func Confidence(input MatchInput, candidate Candidate) float64 {
	weighted, weights := 0.0, 0.0
	add := func(weight int, score float64) {
		weights += float64(weight)
		weighted += float64(weight) * score
	}

	add(35, nikScore(input.NIK, candidate.NIK))
	add(25, nameScore(input.FullName, candidate.FullName))
	add(15, dobScore(input.DOB, candidate.DOB))
	if input.HasPhone {
		add(15, phoneScore(input.Phone, candidate.Phones))
	}
	if input.HasSpouse {
		add(10, nameScore(input.SpouseName, candidate.SpouseName))
	}
	if weights == 0 {
		return 0
	}
	return math.Round(weighted/weights*10000) / 100
}

// minPhoneDistance returns the smallest Levenshtein distance to any candidate phone.
func minPhoneDistance(input string, phones []Phone) int {
	target := NormalizePhone(input)
	best := -1
	for _, phone := range phones {
		distance := levenshtein(target, NormalizePhone(phone.Number))
		if best < 0 || distance < best {
			best = distance
		}
	}
	return best
}

// EligibleCandidate reports whether a record may be scored for this input.
// A record qualifies when its NIK is within edit distance 2, or a supplied
// phone matches one of its phones within edit distance 1.
func EligibleCandidate(input MatchInput, candidate Candidate) bool {
	if levenshtein(NormalizeNIK(input.NIK), NormalizeNIK(candidate.NIK)) <= 2 {
		return true
	}
	// A record with no phones cannot qualify on a phone match; minPhoneDistance is -1 there.
	return input.HasPhone && len(candidate.Phones) > 0 && minPhoneDistance(input.Phone, candidate.Phones) <= 1
}

// candidatePool filters and keeps the five records with the smallest NIK distance.
func candidatePool(input MatchInput, candidates []Candidate) []Candidate {
	type ranked struct {
		candidate Candidate
		distance  int
	}
	pool := make([]ranked, 0, len(candidates))
	for _, candidate := range candidates {
		if !EligibleCandidate(input, candidate) {
			continue
		}
		pool = append(pool, ranked{
			candidate: candidate,
			distance:  levenshtein(NormalizeNIK(input.NIK), NormalizeNIK(candidate.NIK)),
		})
	}
	sort.SliceStable(pool, func(i, j int) bool { return pool[i].distance < pool[j].distance })
	if len(pool) > 5 {
		pool = pool[:5]
	}
	result := make([]Candidate, len(pool))
	for i, item := range pool {
		result[i] = item.candidate
	}
	return result
}

// BestCandidate returns the highest-confidence eligible candidate and its confidence.
func BestCandidate(input MatchInput, candidates []Candidate) (*Candidate, float64) {
	var best *Candidate
	bestScore := -1.0
	for _, candidate := range candidatePool(input, candidates) {
		slog.Info("candidate", "nik", candidate.NIK, "name", candidate.FullName)
		score := Confidence(input, candidate)
		if score > bestScore {
			copied := candidate
			best, bestScore = &copied, score
		}
	}
	if best == nil {
		return nil, 0
	}
	return best, bestScore
}
