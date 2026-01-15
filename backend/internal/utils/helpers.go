package utils

import (
	"bufio"
	"os"
	"strings"
)

// Truncate 安全地截断字符串以适应指定长度（按 rune 计算，支持中文）
// 同时通过 strings.Clone 切断对原始大行（Row Buffer）的内存引用，防止小字段锁定大内存。
func Truncate(s string, n int) string {
	if len(s) == 0 {
		return ""
	}

	// 如果长度超过限制，string(r[:n]) 本身就会触发复制，从而切断引用
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}

	// 如果没超过限制，必须显式 Clone，否则返回的是原始大字符串的一个切片视图
	// 这样会导致哪怕只存了几个字节，也会让整个几百字节甚至几千字节的原始行无法被 GC
	return strings.Clone(s)
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
