package service

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

// UserData represents the cleaned data structure
type UserData struct {
	OriginalRow []string `json:"-"` // Don't send original row to frontend to save bandwidth
	Name        string   `json:"name"`
	Phone       string   `json:"phone"`
	Address     string   `json:"original_address"`
	Province    string   `json:"province"`
	City        string   `json:"city"`
	District    string   `json:"district"`
	JoinDate    string   `json:"join_date"`
	Status      string   `json:"status"`
}

// CleanerService handles the ETL logic
type CleanerService struct {
	phoneRegex   *regexp.Regexp
	addressRegex *regexp.Regexp
}

func NewCleanerService() *CleanerService {
	// 11 digits, robust against spaces/dashes.
	// We first strip non-digits, then check.
	// But for extraction from text, we might need a regex.
	// Requirements say: "138 0000 0000", "138-0000-0000".

	// Address Regex: A simplified version for Week 1.
	// Handles: "浙江省杭州市西湖区..." or "北京市朝阳区..."
	// Group 1: Province (ends with 省|市|区) -> Special case for direct cities handled in logic
	// But to keep it regex-heavy as requested:
	addrPat := `(?P<province>[^省]+省|[^市]+市)(?P<city>[^市]+市|[^区]+区)?(?P<district>[^区]+区|[^县]+县)?`
	return &CleanerService{
		phoneRegex:   regexp.MustCompile(`\D`), // Matches non-digits
		addressRegex: regexp.MustCompile(addrPat),
	}
}

// CleanPhone normalizes phone numbers
func (s *CleanerService) CleanPhone(input string) (string, error) {
	// Remove all non-digits
	clean := s.phoneRegex.ReplaceAllString(input, "")

	if len(clean) != 11 {
		return input, fmt.Errorf("invalid length: %d", len(clean))
	}
	// Check prefix (optional, simple check)
	if !strings.HasPrefix(clean, "1") {
		return input, fmt.Errorf("invalid prefix")
	}
	return clean, nil
}

// CleanDate standardizes dates to YYYY-MM-DD
func (s *CleanerService) CleanDate(input string) (string, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return "", fmt.Errorf("empty date")
	}

	// Layouts to attempt
	layouts := []string{
		"2006-01-02",
		"2006/1/2",
		"2006/01/02",
		"2006.1.2",
		"20060102",
		"02-01-2006", // DD-MM-YYYY
	}

	// Special handling for "23年1月1日" -> "2023-01-01"
	// Replace Chinese chars with separators
	normalized := input
	normalized = strings.ReplaceAll(normalized, "年", "-")
	normalized = strings.ReplaceAll(normalized, "月", "-")
	normalized = strings.ReplaceAll(normalized, "日", "")
	// If it was "23-1-1", we need to handle 2-digit year "23" -> "2023"
	// Go's parsing is strict. Let's try parsing `normalized` with layouts too.

	// Add normalized layouts
	layouts = append(layouts, "06-1-2", "2006-1-2")

	for _, layout := range layouts {
		t, err := time.Parse(layout, input)
		if err == nil {
			return t.Format("2006-01-02"), nil
		}
		// Try with normalized string
		t, err = time.Parse(layout, normalized)
		if err == nil {
			return t.Format("2006-01-02"), nil
		}
	}

	return input, fmt.Errorf("unknown format")
}

// ExtractAddress extracts Province, City, District
func (s *CleanerService) ExtractAddress(fullAddress string) (string, string, string) {
	// This is a naive implementation.
	// Logic:
	// 1. If starts with (Beijing/Shanghai/Tianjin/Chongqing), Province = City = X City.
	// 2. Else find "省".

	// Regex approach as requested:
	matches := s.addressRegex.FindStringSubmatch(fullAddress)
	if len(matches) < 4 {
		// Fallback for simple direct cities parsing manually if regex failed partial
		return "", "", ""
	}

	// Named map
	result := make(map[string]string)
	for i, name := range s.addressRegex.SubexpNames() {
		if i != 0 && name != "" && i < len(matches) {
			result[name] = matches[i]
		}
	}

	return result["province"], result["city"], result["district"]
}

// ColIndices holds the index for each field
type ColIndices struct {
	Name    int
	Phone   int
	Address int
	Date    int
}

// ProcessRow processes a single row with dynamic matching
func (s *CleanerService) ProcessRow(row []string, idx ColIndices) UserData {
	safeGet := func(i int) string {
		if i >= 0 && i < len(row) {
			return row[i]
		}
		return ""
	}

	data := UserData{
		OriginalRow: row,
		Name:        safeGet(idx.Name),
		Phone:       safeGet(idx.Phone),
		Address:     safeGet(idx.Address),
		JoinDate:    safeGet(idx.Date),
		Status:      "Clean",
	}

	// 1. Phone
	if p, err := s.CleanPhone(data.Phone); err != nil {
		data.Status = fmt.Sprintf("Error: Phone %v", err)
	} else {
		data.Phone = p
	}

	// 2. Date
	if d, err := s.CleanDate(data.JoinDate); err != nil {
		if data.Status == "Clean" {
			data.Status = fmt.Sprintf("Error: Date %v", err)
		} else {
			data.Status += fmt.Sprintf("; Date %v", err)
		}
	} else {
		data.JoinDate = d
	}

	// 3. Address
	data.Province, data.City, data.District = s.ExtractAddress(data.Address)

	return data
}
