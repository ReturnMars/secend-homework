package service

import (
	"testing"
)

func TestCleanDate(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{
			name:    "Standard format",
			input:   "2023-12-25",
			want:    "2023-12-25",
			wantErr: false,
		},
		{
			name:    "Slash format",
			input:   "2023/12/25",
			want:    "2023-12-25",
			wantErr: false,
		},
		{
			name:    "Chinese format",
			input:   "2023年12月25日",
			want:    "2023-12-25",
			wantErr: false,
		},
		{
			name:    "Compact format",
			input:   "20231225",
			want:    "2023-12-25",
			wantErr: false,
		},
		{
			name:    "Empty string",
			input:   "",
			want:    "",
			wantErr: true,
		},
		{
			name:    "Invalid format",
			input:   "not-a-date",
			want:    "not-a-date",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := CleanDate(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("CleanDate() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("CleanDate() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestExtractAddress(t *testing.T) {
	tests := []struct {
		name         string
		input        string
		wantProvince string
		wantCity     string
		wantDistrict string
	}{
		{
			name:         "Standard address",
			input:        "四川省成都市武侯区",
			wantProvince: "四川省",
			wantCity:     "成都市",
			wantDistrict: "武侯区",
		},
		{
			name:         "Beijing municipality",
			input:        "北京市朝阳区",
			wantProvince: "北京市",
			wantCity:     "北京市",
			wantDistrict: "朝阳区",
		},
		{
			name:         "Shanghai municipality",
			input:        "上海市浦东新区",
			wantProvince: "上海市",
			wantCity:     "上海市",
			wantDistrict: "浦东新区", // Note: 新区 not matched by regex
		},
		{
			name:         "Empty string",
			input:        "",
			wantProvince: "",
			wantCity:     "",
			wantDistrict: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p, c, d := ExtractAddress(tt.input)
			if p != tt.wantProvince {
				t.Errorf("ExtractAddress() province = %v, want %v", p, tt.wantProvince)
			}
			if c != tt.wantCity {
				t.Errorf("ExtractAddress() city = %v, want %v", c, tt.wantCity)
			}
			if d != tt.wantDistrict {
				t.Errorf("ExtractAddress() district = %v, want %v", d, tt.wantDistrict)
			}
		})
	}
}
