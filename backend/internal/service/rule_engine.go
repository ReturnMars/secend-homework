package service

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// DefaultRuleConfigs 定义了系统内置的默认规则。
// 这些规则会根据列名进行启发式匹配。
var DefaultRuleConfigs = []RuleConfig{
	{
		Column: "phone",
		Rules: []struct {
			Type    string      `json:"type"`
			Pattern string      `json:"pattern,omitempty"`
			Min     int         `json:"min,omitempty"`
			Max     int         `json:"max,omitempty"`
			Old     interface{} `json:"old,omitempty"`
			New     interface{} `json:"new,omitempty"`
			Comp    string      `json:"comp,omitempty"`
		}{
			{Type: "replace", Old: " ", New: ""},
			{Type: "regex", Pattern: `^1[3-9]\d{9}$`},
		},
	},
	{
		Column: "name",
		Rules: []struct {
			Type    string      `json:"type"`
			Pattern string      `json:"pattern,omitempty"`
			Min     int         `json:"min,omitempty"`
			Max     int         `json:"max,omitempty"`
			Old     interface{} `json:"old,omitempty"`
			New     interface{} `json:"new,omitempty"`
			Comp    string      `json:"comp,omitempty"`
		}{
			{Type: "required"},
			{Type: "length", Min: 2, Max: 20},
		},
	},
	{
		Column: "date",
		Rules: []struct {
			Type    string      `json:"type"`
			Pattern string      `json:"pattern,omitempty"`
			Min     int         `json:"min,omitempty"`
			Max     int         `json:"max,omitempty"`
			Old     interface{} `json:"old,omitempty"`
			New     interface{} `json:"new,omitempty"`
			Comp    string      `json:"comp,omitempty"`
		}{
			{Type: "date"},
		},
	},
	{
		Column: "address_province",
		Rules: []struct {
			Type    string      `json:"type"`
			Pattern string      `json:"pattern,omitempty"`
			Min     int         `json:"min,omitempty"`
			Max     int         `json:"max,omitempty"`
			Old     interface{} `json:"old,omitempty"`
			New     interface{} `json:"new,omitempty"`
			Comp    string      `json:"comp,omitempty"`
		}{
			{Type: "address", Comp: "province"},
		},
	},
	{
		Column: "address_city",
		Rules: []struct {
			Type    string      `json:"type"`
			Pattern string      `json:"pattern,omitempty"`
			Min     int         `json:"min,omitempty"`
			Max     int         `json:"max,omitempty"`
			Old     interface{} `json:"old,omitempty"`
			New     interface{} `json:"new,omitempty"`
			Comp    string      `json:"comp,omitempty"`
		}{
			{Type: "address", Comp: "city"},
		},
	},
	{
		Column: "address_district",
		Rules: []struct {
			Type    string      `json:"type"`
			Pattern string      `json:"pattern,omitempty"`
			Min     int         `json:"min,omitempty"`
			Max     int         `json:"max,omitempty"`
			Old     interface{} `json:"old,omitempty"`
			New     interface{} `json:"new,omitempty"`
			Comp    string      `json:"comp,omitempty"`
		}{
			{Type: "address", Comp: "district"},
		},
	},
}

// CleaningStrategy 定义了数据清洗和校验的通用接口
type CleaningStrategy interface {
	// Clean 执行清洗/校验逻辑。返回清洗后的字符串或错误。
	Clean(input string) (string, error)
	// GetType 返回策略类型
	GetType() string
}

// RegexStrategy 基于正则表达式的清洗策略
type RegexStrategy struct {
	Pattern string
	regex   *regexp.Regexp
}

func NewRegexStrategy(pattern string) (*RegexStrategy, error) {
	re, err := regexp.Compile(pattern)
	if err != nil {
		return nil, err
	}
	return &RegexStrategy{Pattern: pattern, regex: re}, nil
}

func (s *RegexStrategy) Clean(input string) (string, error) {
	if !s.regex.MatchString(input) {
		return input, fmt.Errorf("does not match pattern: %s", s.Pattern)
	}
	return input, nil
}

func (s *RegexStrategy) GetType() string { return "regex" }

// LengthStrategy 长度校验策略
type LengthStrategy struct {
	Min int
	Max int
}

func (s *LengthStrategy) Clean(input string) (string, error) {
	l := len(input)
	if s.Min > 0 && l < s.Min {
		return input, fmt.Errorf("too short: min %d", s.Min)
	}
	if s.Max > 0 && l > s.Max {
		return input, fmt.Errorf("too long: max %d", s.Max)
	}
	return input, nil
}

func (s *LengthStrategy) GetType() string { return "length" }

// RequiredStrategy 非空校验策略
type RequiredStrategy struct{}

func (s *RequiredStrategy) Clean(input string) (string, error) {
	if input == "" {
		return "", fmt.Errorf("is required")
	}
	return input, nil
}

func (s *RequiredStrategy) GetType() string { return "required" }

// ReplaceStrategy 字符替换策略（例如移除所有非数字字符）
type ReplaceStrategy struct {
	Old string
	New string
}

func (s *ReplaceStrategy) Clean(input string) (string, error) {
	return strings.ReplaceAll(input, fmt.Sprintf("%v", s.Old), fmt.Sprintf("%v", s.New)), nil
}

func (s *ReplaceStrategy) GetType() string { return "replace" }

// DateStrategy 日期规范化策略
type DateStrategy struct{}

func (s *DateStrategy) Clean(input string) (string, error) {
	return CleanDate(input) // 复用现有的高性能 CleanDate 逻辑
}

func (s *DateStrategy) GetType() string { return "date" }

// AddressStrategy 地址解析策略
type AddressStrategy struct {
	Component string // "province", "city", or "district"
}

func (s *AddressStrategy) Clean(input string) (string, error) {
	p, c, d := ExtractAddress(input)
	switch s.Component {
	case "province":
		return p, nil
	case "city":
		return c, nil
	case "district":
		return d, nil
	default:
		return input, nil
	}
}

func (s *AddressStrategy) GetType() string { return "address" }

// RuleEngine 规则引擎，管理一组策略并执行
type RuleEngine struct {
	ColumnRules map[string][]CleaningStrategy
}

func NewRuleEngine() *RuleEngine {
	return &RuleEngine{
		ColumnRules: make(map[string][]CleaningStrategy),
	}
}

// RuleConfig 定义了 JSON 配置文件中的单条规则结构
type RuleConfig struct {
	Column string `json:"column"`
	Rules  []struct {
		Type    string      `json:"type"`
		Pattern string      `json:"pattern,omitempty"`
		Min     int         `json:"min,omitempty"`
		Max     int         `json:"max,omitempty"`
		Old     interface{} `json:"old,omitempty"`
		New     interface{} `json:"new,omitempty"`
		Comp    string      `json:"comp,omitempty"`
	} `json:"rules"`
}

// LoadConfig 从 JSON 数据加载规则
func (e *RuleEngine) LoadConfig(jsonData []byte) error {
	var configs []RuleConfig
	if err := json.Unmarshal(jsonData, &configs); err != nil {
		return err
	}

	for _, cfg := range configs {
		var strategies []CleaningStrategy
		for _, r := range cfg.Rules {
			var s CleaningStrategy
			var err error

			switch r.Type {
			case "required":
				s = &RequiredStrategy{}
			case "regex":
				s, err = NewRegexStrategy(r.Pattern)
			case "length":
				s = &LengthStrategy{Min: r.Min, Max: r.Max}
			case "replace":
				s = &ReplaceStrategy{
					Old: fmt.Sprintf("%v", r.Old),
					New: fmt.Sprintf("%v", r.New),
				}
			case "date":
				s = &DateStrategy{}
			case "address":
				s = &AddressStrategy{Component: r.Comp}
			default:
				return fmt.Errorf("unknown strategy type: %s", r.Type)
			}

			if err != nil {
				return err
			}
			strategies = append(strategies, s)
		}
		e.ColumnRules[strings.ToLower(cfg.Column)] = strategies
	}
	return nil
}

// GetSuggestedRules 根据提供的 headers 返回建议的规则。
func GetSuggestedRules(headers []string) []RuleConfig {
	var suggestions []RuleConfig
	hasAddress := false

	for _, h := range headers {
		lowerH := strings.ToLower(h)
		var matchedRule *RuleConfig

		// 精确或包含匹配（排除 address_ 开头的特殊内置列）
		for _, dr := range DefaultRuleConfigs {
			if !strings.HasPrefix(dr.Column, "address_") {
				if strings.ToLower(dr.Column) == lowerH || strings.Contains(lowerH, strings.ToLower(dr.Column)) {
					matchedRule = &dr
					break
				}
			}
		}

		if matchedRule != nil {
			// 复制规则以防修改原件（虽然这里是值传递，但 Rules 是 slice）
			newRule := RuleConfig{Column: h}
			newRule.Rules = append(newRule.Rules, matchedRule.Rules...)
			suggestions = append(suggestions, newRule)
		} else {
			// 如果没匹配到默认规则，也返回该列以便展示，但规则为空
			suggestions = append(suggestions, RuleConfig{Column: h, Rules: nil})
		}

		if strings.Contains(lowerH, "address") || strings.Contains(h, "地址") {
			hasAddress = true
		}
	}

	// 如果包含地址列，自动添加省市区解析建议
	if hasAddress {
		for _, dr := range DefaultRuleConfigs {
			if strings.HasPrefix(dr.Column, "address_") {
				// 检查是否已经存在同名列
				exists := false
				for _, s := range suggestions {
					if s.Column == dr.Column {
						exists = true
						break
					}
				}
				if !exists {
					suggestions = append(suggestions, dr)
				}
			}
		}
	}

	return suggestions
}

// Execute 对指定列的数据运行所有定义的策略
func (e *RuleEngine) Execute(columnName string, input string) (string, error) {
	strategies, ok := e.ColumnRules[strings.ToLower(columnName)]
	if !ok {
		// log.Printf("[RuleEngine] No rules for column: %s", columnName)
		return input, nil
	}

	currentValue := input
	for _, strategy := range strategies {
		var err error
		currentValue, err = strategy.Clean(currentValue)
		if err != nil {
			return currentValue, err
		}
	}

	return currentValue, nil
}
