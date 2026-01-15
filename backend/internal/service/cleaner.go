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
	// regexNormalName 匹配正常姓名字符：中文、字母、数字、空格、点、下划线
	regexNormalName = regexp.MustCompile(`[^\p{Han}a-zA-Z0-9\s._-]`)
)

// CleanName 清洗并验证姓名
func CleanName(name string) (string, error) {
	s := strings.TrimSpace(name)
	if s == "" {
		return "", fmt.Errorf("name cannot be empty")
	}

	// 过滤特殊字符和 Emoji (保留中文、英文、数字、基本分隔符)
	cleaned := regexNormalName.ReplaceAllString(s, "")

	if len(cleaned) < len(s) {
		// 如果有字符被剔除，说明含有异常符号
		return cleaned, fmt.Errorf("contains invalid characters or emojis")
	}

	return cleaned, nil
}

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

	d := strings.TrimSpace(dateStr)

	// 1. 处理中文格式，如 "23年1月1日" 或 "2023年01月01日"
	if strings.ContainsAny(d, "年月日") {
		re := regexp.MustCompile(`(\d+)[年/-](\d+)[月/-](\d+)日?`)
		matches := re.FindStringSubmatch(d)
		if len(matches) == 4 {
			year := matches[1]
			month := matches[2]
			day := matches[3]

			// 处理 2 位年份补全
			if len(year) == 2 {
				year = "20" + year
			}
			// 补全月份和日期
			if len(month) == 1 {
				month = "0" + month
			}
			if len(day) == 1 {
				day = "0" + day
			}
			d = fmt.Sprintf("%s-%s-%s", year, month, day)
		}
	}

	// 2. 清理常见分隔符并统一使用短横线
	d = strings.ReplaceAll(d, "/", "-")
	d = strings.ReplaceAll(d, ".", "-")

	// 3. 使用预编译正则验证最终格式
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

// ValidateRecord 预判记录在清洗后的状态和错误信息
func ValidateRecord(name, phone, date string) (status string, errorMessage string) {
	var errors []string

	_, errName := CleanName(name)
	if errName != nil {
		errors = append(errors, fmt.Sprintf("Name: %v", errName))
	}

	_, errPhone := CleanPhone(phone)
	if errPhone != nil {
		errors = append(errors, fmt.Sprintf("Phone: %v", errPhone))
	}

	_, errDate := CleanDate(date)
	if errDate != nil {
		errors = append(errors, fmt.Sprintf("Date: %v", errDate))
	}

	if len(errors) > 0 {
		return "Error", fmt.Sprintf("%v", errors)
	}
	return "Clean", ""
}
