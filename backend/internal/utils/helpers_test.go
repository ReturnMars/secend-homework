package utils

import (
	"os"
	"path/filepath"
	"testing"
)

func TestTruncate(t *testing.T) {
	tests := []struct {
		name  string
		input string
		n     int
		want  string
	}{
		{
			name:  "无需截断",
			input: "hello",
			n:     10,
			want:  "hello",
		},
		{
			name:  "刚好达到长度",
			input: "hello",
			n:     5,
			want:  "hello",
		},
		{
			name:  "需要截断",
			input: "hello world",
			n:     5,
			want:  "hello",
		},
		{
			name:  "中文字符",
			input: "你好世界",
			n:     2,
			want:  "你好",
		},
		{
			name:  "空字符串",
			input: "",
			n:     5,
			want:  "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Truncate(tt.input, tt.n)
			if got != tt.want {
				t.Errorf("Truncate() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCountLines(t *testing.T) {
	// 创建临时测试文件
	tempDir := t.TempDir()

	tests := []struct {
		name     string
		content  string
		expected int
	}{
		{
			name:     "三行文件",
			content:  "line1\nline2\nline3\n",
			expected: 3,
		},
		{
			name:     "空文件",
			content:  "",
			expected: 0,
		},
		{
			name:     "单行无换行",
			content:  "single line",
			expected: 0,
		},
		{
			name:     "单行有换行",
			content:  "single line\n",
			expected: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// 创建临时文件
			filePath := filepath.Join(tempDir, tt.name+".txt")
			err := os.WriteFile(filePath, []byte(tt.content), 0644)
			if err != nil {
				t.Fatalf("创建测试文件失败: %v", err)
			}

			got, err := CountLines(filePath)
			if err != nil {
				t.Fatalf("CountLines() 错误: %v", err)
			}
			if got != tt.expected {
				t.Errorf("CountLines() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestCountLines_FileNotFound(t *testing.T) {
	_, err := CountLines("/nonexistent/file.txt")
	if err == nil {
		t.Error("CountLines() 应该对不存在的文件返回错误")
	}
}
