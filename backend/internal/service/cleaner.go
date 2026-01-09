package service

import (
	"fmt"
	"regexp"
	"strings"
)

var (
	// regexPhone 匹配所有非数字字符，用于清理
	regexPhone = regexp.MustCompile(`[^\d]`)
	// regexDate 预编译日期格式正则以提升千万级处理速度
	regexDate = regexp.MustCompile(`^\d{4}-\d{1,2}-\d{1,2}$`)
	// regexAddress 提取省市区的启发式正则
	regexAddress = regexp.MustCompile(`^([^省]+省|[^自治区]+自治区|[^市]+市)([^市]+市|[^州]+州|[^县]+县|[^盟]+盟)?([^区]+区|[^县]+县|[^旗]+旗)?`)
)

// CleanPhone 尝试清洗并规范化手机号
func CleanPhone(phone string) (string, error) {
	if phone == "" {
		return "", fmt.Errorf("empty phone")
	}

	// 高性能清理：由于每秒处理 5w+ 行，避开 regexp.ReplaceAllString 的分配负载，改用手写 Loop
	var b strings.Builder
	b.Grow(len(phone))
	for i := 0; i < len(phone); i++ {
		if phone[i] >= '0' && phone[i] <= '9' {
			b.WriteByte(phone[i])
		}
	}
	cleaned := b.String()

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

	// 使用预编译正则：避免千万次重复编译
	if !regexDate.MatchString(d) {
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
