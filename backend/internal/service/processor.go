package service

import (
	"fmt"
	"log"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"etl-tool/internal/model"
	"etl-tool/internal/repository"
	"etl-tool/internal/utils"

	"gorm.io/gorm"
)

// CleanerService 是核心服务，提供数据清洗和处理功能
type CleanerService struct {
	DB *gorm.DB
}

// NewCleanerService 创建一个新的 CleanerService 实例
func NewCleanerService() *CleanerService {
	return &CleanerService{DB: repository.DB}
}

// ProcessFileAsync 启动协程异步处理文件
func (s *CleanerService) ProcessFileAsync(batchID uint, filePath string) {
	go func() {
		err := s.processFileStream(batchID, filePath)
		if err != nil {
			log.Printf("[Crucial] Batch %d Failed: %v", batchID, err)
			// 将错误信息记录到数据库，以便前端展示
			s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
				Updates(map[string]interface{}{
					"status": model.BatchStatusFailed,
					"error":  err.Error(),
				})
		}
	}()
}

// processFileStream 使用流式迭代器处理文件以节省内存
func (s *CleanerService) processFileStream(batchID uint, filePath string) error {
	// 1. 估算总行数
	startCount := time.Now()
	totalLines, _ := utils.CountLines(filePath)
	if totalLines > 0 {
		totalLines-- // 排除表头
	}
	log.Printf("[Performance] CountLines took: %v for file: %s", time.Since(startCount), filePath)

	// 2. 更新状态和总行数
	s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
		Updates(map[string]interface{}{
			"status":     model.BatchStatusProcessing,
			"total_rows": totalLines,
		})

	// 3. 打开文件流
	iter, err := utils.NewRowIterator(filePath)
	if err != nil {
		return err
	}
	defer iter.Close()

	// 4. 读取表头
	header, err := s.readHeader(iter)
	if err != nil {
		return err
	}

	indices := utils.DetectHeaders(header)
	if indices.Phone == -1 && indices.Name == -1 {
		return fmt.Errorf("could not detect required columns (Name/Phone). Header was: %v", header)
	}

	// 5. 极致性能：针对千万级数据，先卸载索引，写完后瞬间重建
	repository.DropSearchIndexes()
	stats, err := s.processRows(iter, batchID, indices)
	repository.RebuildSearchIndexes()

	if err != nil {
		return err
	}

	// 6. 更新批量状态为已完成
	return s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
		Updates(map[string]interface{}{
			"status":         model.BatchStatusCompleted,
			"processed_rows": stats.rowIdx,
			"total_rows":     stats.rowIdx,
			"success_count":  stats.successRows,
			"failure_count":  stats.failedRows,
			"completed_at":   time.Now(),
		}).Error
}

// readHeader 从迭代器读取并验证表头行
func (s *CleanerService) readHeader(iter utils.RowIterator) ([]string, error) {
	if !iter.Next() {
		if err := iter.Err(); err != nil {
			log.Printf("DEBUG: Header read error: %v", err)
			return nil, err
		}
		return nil, fmt.Errorf("file is empty or missing header")
	}
	header := iter.Row()

	// 移除 BOM
	if len(header) > 0 {
		header[0] = strings.TrimPrefix(header[0], "\xEF\xBB\xBF")
	}
	return header, nil
}

// processStats 文件处理期间的统计信息
type processStats struct {
	rowIdx      int
	successRows int
	failedRows  int
}

// processRows 采用高度并发的 Worker Pool 模式处理数据
func (s *CleanerService) processRows(iter utils.RowIterator, batchID uint, indices utils.ColIndices) (*processStats, error) {
	numWorkers := runtime.NumCPU() * 2 // 充分利用多核 CPU
	if numWorkers < 8 {
		numWorkers = 8
	}
	const batchSize = 4000 // 极致调优：13 字段 * 4000 = 52000 < 65535

	stats := &processStats{rowIdx: 1}

	// 定义内部任务结构
	type task struct {
		row []string
		idx int
	}

	// Channel 定义，设置缓冲区以控制内存占用
	taskChan := make(chan task, 20000) // 增大缓冲区
	resultChan := make(chan model.Record, 20000)
	errChan := make(chan error, 1)

	var wg sync.WaitGroup
	var successCount int64
	var failureCount int64

	// 1. 启动 Worker 池进行并行清洗 (CPU 密集型)
	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for t := range taskChan {
				rec := s.createRecordFromRow(t.row, batchID, t.idx, indices)
				if rec.Status == "Clean" {
					atomic.AddInt64(&successCount, 1)
				} else {
					atomic.AddInt64(&failureCount, 1)
				}
				resultChan <- rec
			}
		}()
	}

	// 2. 启动数据持久化协程 (方案 B：优化批量写入负载)
	saveDone := make(chan struct{})
	go func() {
		defer close(saveDone)
		var batch []map[string]interface{}

		for rec := range resultChan {
			// 使用 map 存储以避开 GORM 对 Struct 的反射损耗
			batch = append(batch, map[string]interface{}{
				"batch_id":      rec.BatchID,
				"row_index":     rec.RowIndex,
				"name":          rec.Name,
				"phone":         rec.Phone,
				"date":          rec.Date,
				"address":       rec.Address,
				"province":      rec.Province,
				"city":          rec.City,
				"district":      rec.District,
				"status":        rec.Status,
				"error_message": rec.ErrorMessage,
				"raw_data":      rec.RawData,
			})

			if len(batch) >= batchSize {
				// 高速写入：直接操作 Table
				if err := s.DB.Table("records").Create(batch).Error; err != nil {
					log.Printf("[Saver] Bulk insert failed: %v", err)
				}

				currentProcessed := batch[len(batch)-1]["row_index"].(int)
				if currentProcessed%10000 == 0 {
					sCount := atomic.LoadInt64(&successCount)
					fCount := atomic.LoadInt64(&failureCount)
					go func(idx int, sc, fc int64) {
						s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
							Updates(map[string]interface{}{
								"processed_rows": idx,
								"success_count":  int(sc),
								"failure_count":  int(fc),
							})
					}(currentProcessed, sCount, fCount)
				}
				batch = nil
			}
		}
		if len(batch) > 0 {
			s.DB.Table("records").Create(batch)
		}
	}()

	// 3. 生产者：读取文件并分发任务
	startTime := time.Now()
	lastLogTime := time.Now()
	var processErr error
Loop:
	for iter.Next() {
		stats.rowIdx++

		// 每 100 万行打印一次实时吞吐量
		if stats.rowIdx%1000000 == 0 {
			elapsed := time.Since(lastLogTime)
			log.Printf("[Performance] Processed 1,000,000 rows, current speed: %.2f rows/sec", 1000000/elapsed.Seconds())
			lastLogTime = time.Now()
		}

		select {
		case err := <-errChan:
			processErr = err
			break Loop
		case taskChan <- task{row: iter.Row(), idx: stats.rowIdx}:
		}
	}

	close(taskChan)   // 通知 Worker 停止
	wg.Wait()         // 等待 Worker 完成计算
	close(resultChan) // 通知 Saver 停止
	<-saveDone        // 等待数据库写入完成

	totalElapsed := time.Since(startTime)
	log.Printf("[Performance] Total processing time (excluding CountLines): %v, Avg speed: %.2f rows/sec",
		totalElapsed, float64(stats.rowIdx)/totalElapsed.Seconds())

	if processErr == nil {
		processErr = iter.Err()
	}

	stats.successRows = int(successCount)
	stats.failedRows = int(failureCount)

	return stats, processErr
}

// createRecordFromRow 从原始行数据创建 Record
func (s *CleanerService) createRecordFromRow(row []string, batchID uint, rowIdx int, indices utils.ColIndices) model.Record {
	getCol := func(idx int) string {
		if idx >= 0 && idx < len(row) {
			return row[idx]
		}
		return ""
	}

	rawName := strings.TrimSpace(getCol(indices.Name))
	rawPhone := strings.TrimSpace(getCol(indices.Phone))
	rawAddress := strings.TrimSpace(getCol(indices.Address))
	rawDate := strings.TrimSpace(getCol(indices.Date))

	rec := model.Record{
		BatchID:  batchID,
		RowIndex: rowIdx,
		Name:     utils.Truncate(rawName, 255),
		Address:  utils.Truncate(rawAddress, 255),
	}

	// 清洗手机号
	cleanPhone, errPhone := CleanPhone(rawPhone)
	rec.Phone = utils.Truncate(cleanPhone, 50)

	// 清洗日期
	cleanDate, errDate := CleanDate(rawDate)
	rec.Date = utils.Truncate(cleanDate, 50)

	// 提取地址信息
	p, c, d := ExtractAddress(rawAddress)
	rec.Province = utils.Truncate(p, 100)
	rec.City = utils.Truncate(c, 100)
	rec.District = utils.Truncate(d, 100)

	// 验证状态
	var errors []string
	if errPhone != nil {
		errors = append(errors, fmt.Sprintf("Phone: %v", errPhone))
	}
	if errDate != nil {
		errors = append(errors, fmt.Sprintf("Date: %v", errDate))
	}

	if len(errors) > 0 {
		rec.Status = "Error"
		rec.ErrorMessage = fmt.Sprintf("%v", errors)
	} else {
		rec.Status = "Clean"
	}

	return rec
}
