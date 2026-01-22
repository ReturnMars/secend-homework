package service

import (
	"fmt"
	"regexp"
	"strings"
)

var (
	// regexDate 预编译日期格式正则以提升千万级处理速度
	regexDate = regexp.MustCompile(`^\d{4}-\d{1,2}-\d{1,2}$`)
	// regexAddress 提取省市区的启发式正则
	regexAddress = regexp.MustCompile(`^([^省]+省|[^自治区]+自治区|[^市]+市)([^市]+市|[^州]+州|[^县]+县|[^盟]+盟)?([^区]+区|[^县]+县|[^旗]+旗)?`)
	// regexChineseDate 提取中文日期格式，预编译以提升速度并减少分配
	regexChineseDate = regexp.MustCompile(`(\d+)[年/-](\d+)[月/-](\d+)日?`)
)

// CleanDate 尝试将各种日期格式转换为标准 YYYY-MM-DD
func CleanDate(dateStr string) (string, error) {
	if dateStr == "" {
		return "", fmt.Errorf("empty date")
	}

	d := strings.TrimSpace(dateStr)

	// 1. 处理中文格式，如 "23年1月1日" 或 "2023年01月01日"
	if strings.ContainsAny(d, "年月日") {
		matches := regexChineseDate.FindStringSubmatch(d)
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

	// 2. 处理紧凑格式 (yyyyMMdd)，如 "20231225"
	if len(d) == 8 {
		allDigits := true
		for _, c := range d {
			if c < '0' || c > '9' {
				allDigits = false
				break
			}
		}
		if allDigits {
			d = fmt.Sprintf("%s-%s-%s", d[:4], d[4:6], d[6:8])
		}
	}

	// 3. 清理常见分隔符并统一使用短横线
	d = strings.ReplaceAll(d, "/", "-")
	d = strings.ReplaceAll(d, ".", "-")

	// 4. 使用预编译正则验证最终格式
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

	// 直辖市列表
	municipalities := []string{"北京市", "上海市", "天津市", "重庆市"}

	// 检查是否为直辖市
	for _, m := range municipalities {
		if strings.HasPrefix(addr, m) {
			province = m
			city = m
			// 提取区/县（支持：区、县、新区）
			remaining := addr[len(m):]
			if idx := strings.Index(remaining, "区"); idx != -1 {
				district = remaining[:idx+len("区")]
				// 检查是否为"新区"
				if strings.HasSuffix(remaining[:idx], "新") {
					// 已经包含在 district 中
				}
			} else if idx := strings.Index(remaining, "县"); idx != -1 {
				district = remaining[:idx+len("县")]
			}
			return province, city, district
		}
	}

	// 非直辖市：使用正则匹配
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
