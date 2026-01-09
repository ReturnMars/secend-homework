package service

import (
	"fmt"
	"regexp"
	"strings"
)

var (
	// regexPhone 匹配所有非数字字符，用于清理
	regexPhone = regexp.MustCompile(`[^\d]`)
	// regexAddress 提取省市区的启发式正则
	regexAddress = regexp.MustCompile(`^([^省]+省|[^自治区]+自治区|[^市]+市)([^市]+市|[^州]+州|[^县]+县|[^盟]+盟)?([^区]+区|[^县]+县|[^旗]+旗)?`)
)

// CleanPhone 尝试清洗并规范化手机号
func CleanPhone(phone string) (string, error) {
	if phone == "" {
		return "", fmt.Errorf("empty phone")
	}

	// 1. 移除所有空白和非数字字符
	cleaned := regexPhone.ReplaceAllString(phone, "")

	// 2. 处理常见的中国手机号前缀（+86 或 86）
	if strings.HasPrefix(cleaned, "86") && len(cleaned) == 13 {
		cleaned = cleaned[2:]
	}

	// 3. 验证长度（中国标准 11 位）
	if len(cleaned) != 11 {
		return cleaned, fmt.Errorf("invalid length: %d (expected 11)", len(cleaned))
	}

	return cleaned, nil
}

// CleanDate 尝试将各种日期格式转换为标准 YYYY-MM-DD
func CleanDate(dateStr string) (string, error) {
	if dateStr == "" {
		return "", fmt.Errorf("empty date")
	}

	// 清理常见分隔符并统一使用短横线
	d := strings.ReplaceAll(dateStr, "/", "-")
	d = strings.ReplaceAll(d, ".", "-")
	d = strings.TrimSpace(d)

	// 检查是否符合 YYYY-MM-DD 这种最基本的形态
	match, _ := regexp.MatchString(`^\d{4}-\d{1,2}-\d{1,2}$`, d)
	if !match {
		return d, fmt.Errorf("invalid format")
	}

	return d, nil
}

// ExtractAddress 尝试从长地址字符串中分离出省、市、区/县
func ExtractAddress(addr string) (province, city, district string) {
	if addr == "" {
		return "", "", ""
	}

	res := regexAddress.FindStringSubmatch(addr)
	if len(res) >= 2 {
		province = strings.TrimSpace(res[1])
	}
	if len(res) >= 3 {
		city = strings.TrimSpace(res[2])
	}
	if len(res) >= 4 {
		district = strings.TrimSpace(res[3])
	}

	return province, city, district
}
