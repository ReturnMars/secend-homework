package service

import (
	"testing"
)

func TestRuleEngine_Execute(t *testing.T) {
	config := `[
		{
			"column": "phone",
			"rules": [
				{"type": "replace", "old": "16853168891", "new": "16853168892"},
				{"type": "replace", "old": " ", "new": ""},
				{"type": "regex", "pattern": "^1\\d{10}$"}
			]
		},
		{
			"column": "name",
			"rules": [
				{"type": "length", "min": 2, "max": 10}
			]
		}
	]`

	engine := NewRuleEngine()
	err := engine.LoadConfig([]byte(config))
	if err != nil {
		t.Fatalf("Failed to load config: %v", err)
	}

	tests := []struct {
		column   string
		input    string
		expected string
		wantErr  bool
	}{
		{"phone", "13800138000", "13800138000", false},
		{"phone", "138 0013 8000", "13800138000", false},
		{"phone", "23800138000", "23800138000", true},  // Regex fails
		{"phone", "", "", true},                        // Required fails
		{"phone", "16853168891", "16853168892", false}, // User's case
		{"name", "AI", "AI", false},
		{"name", "A", "A", true},                                   // Length fails (min 2)
		{"name", "VeryLongNameIndeed", "VeryLongNameIndeed", true}, // Length fails (max 10)
	}

	for _, tt := range tests {
		got, err := engine.Execute(tt.column, tt.input)
		if (err != nil) != tt.wantErr {
			t.Errorf("Execute(%s, %s) error = %v, wantErr %v", tt.column, tt.input, err, tt.wantErr)
			continue
		}
		if !tt.wantErr && got != tt.expected {
			t.Errorf("Execute(%s, %s) = %v, want %v", tt.column, tt.input, got, tt.expected)
		}
	}
}

func TestRuleEngine_AddressStrategy(t *testing.T) {
	config := `[
		{
			"column": "address_prov",
			"rules": [{"type": "address", "comp": "province"}]
		},
		{
			"column": "address_city",
			"rules": [{"type": "address", "comp": "city"}]
		}
	]`

	engine := NewRuleEngine()
	engine.LoadConfig([]byte(config))

	input := "上海市浦东新区张江高科"

	prov, _ := engine.Execute("address_prov", input)
	if prov != "上海市" {
		t.Errorf("Expected 上海市, got %s", prov)
	}

	city, _ := engine.Execute("address_city", input)
	if city != "上海市" {
		t.Errorf("Expected 上海市 (for municipality), got %s", city)
	}
}
