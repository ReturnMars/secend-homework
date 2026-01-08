package service

import (
	"testing"
)

func TestSmartUnmarshal(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{
			name:    "Valid JSON",
			input:   `{"name": "Test User", "phone": "123"}`,
			want:    "Test User",
			wantErr: false,
		},
		{
			name:    "Go Struct Format",
			input:   `{ID:1, Name:Legacy User, Phone:123}`,
			want:    "Legacy User",
			wantErr: false,
		},
		{
			name:    "Empty String",
			input:   "",
			wantErr: true,
		},
	}

	s := &CleanerService{}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			target, err := s.smartUnmarshal(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("smartUnmarshal() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr {
				name, _ := target["name"].(string)
				if name != tt.want {
					t.Errorf("smartUnmarshal() got name = %v, want %v", name, tt.want)
				}
			}
		})
	}
}
