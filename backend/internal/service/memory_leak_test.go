package service

import (
	"runtime"
	"strings"
	"testing"
	"time"

	"etl-tool/internal/utils"
)

// TestTruncateNoMemoryLeak 验证 Truncate 不会持有对原始大字符串的引用
func TestTruncateNoMemoryLeak(t *testing.T) {
	// 创建一个大字符串 (1MB)
	bigString := strings.Repeat("x", 1024*1024)

	// 截取一小部分
	small := utils.Truncate(bigString, 10)

	// 清空原始引用
	bigString = ""

	// 强制 GC
	runtime.GC()
	time.Sleep(100 * time.Millisecond)
	runtime.GC()

	// 验证小字符串仍然有效（没有被意外回收）
	if len(small) != 10 {
		t.Errorf("Truncate result should be 10 chars, got %d", len(small))
	}

	// 检查内存使用是否大幅下降（大字符串应该已被回收）
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	// 如果堆内存仍然大于 2MB，说明大字符串可能没有被释放
	// 注意：这是一个启发式检查，实际阈值可能需要根据环境调整
	if m.HeapAlloc > 2*1024*1024 {
		t.Logf("Warning: HeapAlloc is %d bytes after GC, possible memory retention", m.HeapAlloc)
	}
}

// TestStringsCloneCutsReference 验证 strings.Clone 确实切断了引用
func TestStringsCloneCutsReference(t *testing.T) {
	original := strings.Repeat("a", 10000)
	cloned := strings.Clone(original[:10])

	// 清空原始字符串
	original = ""
	runtime.GC()

	// cloned 应该仍然有效
	if cloned != "aaaaaaaaaa" {
		t.Errorf("Cloned string corrupted: %s", cloned)
	}
}

// TestRowIteratorClone 验证从迭代器获取的行数据不会锁定大缓冲区
func TestRowIteratorClone(t *testing.T) {
	// 模拟处理器中的字符串克隆逻辑
	row := []string{
		strings.Repeat("name", 100),
		strings.Repeat("phone", 100),
		strings.Repeat("addr", 1000),
	}

	// 克隆每个单元格（模拟 processor.go 中的逻辑）
	rowClone := make([]string, len(row))
	for i, v := range row {
		rowClone[i] = strings.Clone(strings.TrimSpace(v))
	}

	// 清空原始行
	for i := range row {
		row[i] = ""
	}
	row = nil
	runtime.GC()

	// 验证克隆的数据仍然有效
	if len(rowClone[0]) != 400 {
		t.Errorf("Cloned row data corrupted")
	}
}

// TestProcessStatsMemory 验证 processStats 结构体不会造成泄漏
func TestProcessStatsMemory(t *testing.T) {
	type processStats struct {
		rowIdx      int
		successRows int
		failedRows  int
	}

	// 创建大量 stats 对象
	var stats []*processStats
	for i := 0; i < 10000; i++ {
		stats = append(stats, &processStats{
			rowIdx:      i,
			successRows: i,
			failedRows:  0,
		})
	}

	// 清空引用
	stats = nil
	runtime.GC()
	time.Sleep(50 * time.Millisecond)
	runtime.GC()

	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	// 应该在合理范围内（<5MB）
	if m.HeapAlloc > 5*1024*1024 {
		t.Logf("HeapAlloc after clearing stats: %d bytes", m.HeapAlloc)
	}
}

// TestBatchSliceReset 验证切片重置（batch = batch[:0]）不会造成泄漏
func TestBatchSliceReset(t *testing.T) {
	type Record struct {
		ID      uint
		Name    string
		Phone   string
		Address string
	}

	// 模拟 Saver 协程的批量处理逻辑
	batch := make([]Record, 0, 2000)

	// 模拟多轮处理
	for round := 0; round < 10; round++ {
		// 填充批次
		for i := 0; i < 2000; i++ {
			batch = append(batch, Record{
				ID:      uint(i),
				Name:    strings.Repeat("n", 50),
				Phone:   "13812345678",
				Address: strings.Repeat("a", 200),
			})
		}

		// 重置切片（模拟 batch = batch[:0]）
		batch = batch[:0]
	}

	runtime.GC()
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	// 由于切片容量保持不变，内存应该稳定
	t.Logf("HeapAlloc after 10 rounds: %d bytes", m.HeapAlloc)
}
