package utils

import (
	"bufio"
	"os"
)

// Truncate 安全地截断字符串以适应指定长度（按 rune 计算，支持中文）
func Truncate(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

// CountLines 高效地统计文件行数
func CountLines(path string) (int, error) {
	file, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer file.Close()

	r := bufio.NewReader(file)
	count := 0
	buf := make([]byte, 32*1024)
	for {
		c, err := r.Read(buf)
		for i := 0; i < c; i++ {
			if buf[i] == '\n' {
				count++
			}
		}
		if err != nil {
			break
		}
	}
	return count, nil
}
