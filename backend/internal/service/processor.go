package service

import (
	"context"
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

// activeTasks 维护当前正在运行的任务，支持中断操作
var (
	activeTasks   = make(map[uint]context.CancelFunc)
	activeTasksMu sync.Mutex
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
	ctx, cancel := context.WithCancel(context.Background())

	activeTasksMu.Lock()
	// 如果已有任务在运行，先取消（防止重复处理）
	if oldCancel, exists := activeTasks[batchID]; exists {
		oldCancel()
	}
	activeTasks[batchID] = cancel
	activeTasksMu.Unlock()

	go func() {
		defer func() {
			activeTasksMu.Lock()
			delete(activeTasks, batchID)
			activeTasksMu.Unlock()
		}()

		// 获取当前批次以检查是否需要恢复进度
		var batch model.ImportBatch
		if err := s.DB.First(&batch, batchID).Error; err != nil {
			log.Printf("[Crucial] Batch %d not found: %v", batchID, err)
			return
		}

		err := s.processFileStream(ctx, batchID, filePath, batch.ProcessedRows)
		if err != nil {
			// 如果是由于 Context 取消（暂停或取消），不需要标记为 Failed
			if ctx.Err() != nil {
				log.Printf("[Info] Batch %d processing interrupted: %v", batchID, ctx.Err())
				return
			}

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
func (s *CleanerService) processFileStream(ctx context.Context, batchID uint, filePath string, skipRows int) error {
	// 1. 估算总行数 (如果是重新开始)
	var totalLines int
	if skipRows == 0 {
		startCount := time.Now()
		totalLines64, _ := utils.CountLines(filePath)
		totalLines = int(totalLines64)
		if totalLines > 0 {
			totalLines-- // 排除表头
		}
		log.Printf("[Performance] CountLines took: %v for file: %s", time.Since(startCount), filePath)
	}

	// 2. 更新状态和总行数
	updateMap := map[string]interface{}{
		"status": model.BatchStatusProcessing,
	}
	if skipRows == 0 {
		updateMap["total_rows"] = totalLines
	}
	s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).Updates(updateMap)

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
	stats, err := s.processRows(ctx, iter, batchID, indices, skipRows)

	// 关键：无论成功还是中断（暂停/取消），都应尝试重建索引，以便用户在界面上能正常搜索已导入的数据
	repository.RebuildSearchIndexes()

	if err != nil {
		// 如果是主动中断，我们需要持久化当前的进度，以便后续 Resume
		if ctx.Err() != nil {
			s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
				Updates(map[string]interface{}{
					"processed_rows": stats.rowIdx,
					"success_count":  stats.successRows,
					"failure_count":  stats.failedRows,
				})
		}
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
func (s *CleanerService) processRows(ctx context.Context, iter utils.RowIterator, batchID uint, indices utils.ColIndices, skipRows int) (*processStats, error) {
	numWorkers := runtime.NumCPU() * 2 // 充分利用多核 CPU
	if numWorkers < 8 {
		numWorkers = 8
	}
	const batchSize = 4000 // 极致调优：13 字段 * 4000 = 52000 < 65535

	stats := &processStats{rowIdx: 0}
	if skipRows > 0 {
		stats.rowIdx = skipRows
	}

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

	// 3.1 如果需要恢复进度，执行跳过逻辑
	if skipRows > 0 {
		for i := 0; i < skipRows; i++ {
			if !iter.Next() {
				break
			}
		}
		log.Printf("[Info] Batch %d resumed, skipped %d rows", batchID, skipRows)
	}

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
		case <-ctx.Done():
			// 关键点：当 Context 被取消时（暂停或取消），停止生产
			processErr = ctx.Err()
			break Loop
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

	// 在函数返回前执行一次最终的状态同步 (确保即使不是 10000 的倍数也能精准更新)
	sCount := atomic.LoadInt64(&successCount)
	fCount := atomic.LoadInt64(&failureCount)
	s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
		Updates(map[string]interface{}{
			"processed_rows": stats.rowIdx,
			"success_count":  int(sCount),
			"failure_count":  int(fCount),
		})

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

// PauseBatch 暂停正在运行的任务
func (s *CleanerService) PauseBatch(batchID uint) error {
	activeTasksMu.Lock()
	cancel, exists := activeTasks[batchID]
	if exists {
		cancel()
	}
	activeTasksMu.Unlock()

	return s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
		Update("status", model.BatchStatusPaused).Error
}

// ResumeBatch 恢复暂停的任务
func (s *CleanerService) ResumeBatch(batchID uint) error {
	var batch model.ImportBatch
	if err := s.DB.First(&batch, batchID).Error; err != nil {
		return err
	}

	if batch.Status != model.BatchStatusPaused {
		return fmt.Errorf("only paused batches can be resumed")
	}

	// 重新拉起异步处理
	s.ProcessFileAsync(batchID, batch.FilePath)
	return nil
}

// CancelBatch 取消任务
func (s *CleanerService) CancelBatch(batchID uint) error {
	activeTasksMu.Lock()
	cancel, exists := activeTasks[batchID]
	if exists {
		cancel()
	}
	activeTasksMu.Unlock()

	return s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
		Update("status", model.BatchStatusCancelled).Error
}
