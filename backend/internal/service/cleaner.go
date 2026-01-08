package service

import (
	"fmt"
	"regexp"
	"strings"
	"time"
)

// Logic ported from old service/cleaner.go

var (
	phoneRegex = regexp.MustCompile(`\D`)
	// Address Regex: Province/City/District
	addressRegex = regexp.MustCompile(`(?P<province>[^省]+省|[^市]+市)(?P<city>[^市]+市|[^区]+区)?(?P<district>[^区]+区|[^县]+县)?`)
)

func CleanPhone(input string) (string, error) {
	clean := phoneRegex.ReplaceAllString(input, "")
	if len(clean) != 11 {
		return input, fmt.Errorf("len!=11")
	}
	if !strings.HasPrefix(clean, "1") {
		return input, fmt.Errorf("not start with 1")
	}
	return clean, nil
}

func CleanDate(input string) (string, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return "", fmt.Errorf("empty")
	}

	// Normalize Chinese chars
	normalized := input
	normalized = strings.ReplaceAll(normalized, "年", "-")
	normalized = strings.ReplaceAll(normalized, "月", "-")
	normalized = strings.ReplaceAll(normalized, "日", "")

	layouts := []string{
		"2006-01-02", "2006/1/2", "2006/01/02", "2006.1.2", "20060102",
		"06-1-2", "2006-1-2",
	}

	for _, layout := range layouts {
		if t, err := time.Parse(layout, input); err == nil {
			return t.Format("2006-01-02"), nil
		}
		if t, err := time.Parse(layout, normalized); err == nil {
			return t.Format("2006-01-02"), nil
		}
	}
	return input, fmt.Errorf("invalid format")
}

func ExtractAddress(fullAddress string) (string, string, string) {
	matches := addressRegex.FindStringSubmatch(fullAddress)
	if len(matches) < 4 {
		return "", "", ""
	}
	result := make(map[string]string)
	for i, name := range addressRegex.SubexpNames() {
		if i != 0 && name != "" && i < len(matches) {
			result[name] = matches[i]
		}
	}
	return result["province"], result["city"], result["district"]
}
