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

// CleanPhone removes non-digits and trims space
func CleanPhone(input string) (string, error) {
	input = strings.TrimSpace(input)
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
	fullAddress = strings.TrimSpace(fullAddress)
	matches := addressRegex.FindStringSubmatch(fullAddress)
	if len(matches) < 2 {
		return "", "", ""
	}

	result := make(map[string]string)
	for i, name := range addressRegex.SubexpNames() {
		if i != 0 && name != "" && i < len(matches) {
			result[name] = strings.TrimSpace(matches[i])
		}
	}

	p := result["province"]
	c := result["city"]
	d := result["district"]

	// 特殊处理直辖市 (Beijing, Shanghai, Tianjin, Chongqing)
	municipalities := map[string]bool{"北京市": true, "上海市": true, "天津市": true, "重庆市": true}
	if municipalities[p] {
		// 如果是直辖市且解析出的 city 为空或带有 "区/县"，将其顺移至 district
		if strings.HasSuffix(c, "区") || strings.HasSuffix(c, "县") {
			d = c
			c = p // 城市名等于省份名
		} else if c == "" {
			c = p
		}
	}

	return p, c, d
}
