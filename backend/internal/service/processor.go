package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"runtime"
	"runtime/debug"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"etl-tool/internal/config"
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
// CleanerService 是核心服务，提供数据清洗和处理功能
type CleanerService struct {
	DB          *gorm.DB
	batchSpeeds sync.Map      // 存储实时处理速度 (key: batchID, value: float64)
	processSem  chan struct{} // 限制并发处理任务数，防止内存爆炸
	Engine      *RuleEngine   // 规则引擎
}

// NewCleanerService 创建一个新的 CleanerService 实例
func NewCleanerService() *CleanerService {
	// 自适应并发限制：逻辑核心数的一半，最低 2，最高 8（防止磁盘 IO 饱和）
	limit := runtime.NumCPU() / 2
	if limit < 2 {
		limit = 2
	}
	if limit > 8 {
		limit = 8
	}

	engine := NewRuleEngine()
	if config.AppConfig != nil && config.AppConfig.CleaningRules != nil {
		jsonData, err := json.Marshal(config.AppConfig.CleaningRules)
		if err == nil {
			engine.LoadConfig(jsonData)
		} else {
			log.Printf("[RuleEngine] Error marshaling cleaning rules: %v", err)
		}
	}

	return &CleanerService{
		DB:         repository.DB,
		processSem: make(chan struct{}, limit),
		Engine:     engine,
	}
}

// ProcessFileAsync 启动协程异步处理文件
func (s *CleanerService) ProcessFileAsync(batchID uint, filePath string) {
	// 获取处理令牌（并发控制）
	select {
	case s.processSem <- struct{}{}:
		log.Printf("[Queue] Batch %d starting processing", batchID)
	default:
		log.Printf("[Queue] Batch %d waiting for slot", batchID)
		s.processSem <- struct{}{}
	}

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
			if r := recover(); r != nil {
				log.Printf("[PANIC] Batch %d processing panicked: %v", batchID, r)
				// 确保即使 panic 也更新状态
				s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
					Updates(map[string]interface{}{
						"status": model.BatchStatusFailed,
						"error":  fmt.Sprintf("internal panic: %v", r),
					})
			}
		}()
		defer func() {
			activeTasksMu.Lock()
			delete(activeTasks, batchID)
			activeTasksMu.Unlock()
			// 释放令牌
			<-s.processSem
			// 清理该批次的速度统计缓存
			s.batchSpeeds.Delete(batchID)
		}()

		// 获取当前批次以检查是否需要恢复进度
		var batch model.ImportBatch
		if err := s.DB.First(&batch, batchID).Error; err != nil {
			log.Printf("[Crucial] Batch %d not found: %v", batchID, err)
			return
		}

		err := s.processFileStream(ctx, batchID, filePath, batch.ProcessedRows, batch.Rules)
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
func (s *CleanerService) processFileStream(ctx context.Context, batchID uint, filePath string, skipRows int, rules string) error {
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

	// 5. 初始化该批次特有的规则引擎
	engine := NewRuleEngine()
	if rules != "" {
		if err := engine.LoadConfig([]byte(rules)); err != nil {
			log.Printf("[RuleEngine] Warning: Failed to load custom rules for batch %d: %v. Falling back to defaults.", batchID, err)
			// 如果前端提供的规则格式错误，在此处记录并继续（或返回错误）
		}
	} else if config.AppConfig != nil && config.AppConfig.CleaningRules != nil {
		// 回退到全局默认规则
		jsonData, _ := json.Marshal(config.AppConfig.CleaningRules)
		engine.LoadConfig(jsonData)
	}

	// 6. 极致性能：针对千万级数据，先卸载索引，写完后瞬间重建
	repository.DropSearchIndexes()
	stats, err := s.processRows(ctx, iter, header, batchID, indices, skipRows, engine)

	// 数据已全部入库，但在搜索生效前需要重建索引
	if err == nil {
		s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).Update("status", model.BatchStatusIndexing)

		// 关键：进入索引阶段后，从 activeTasks 移除，防止被错误中断
		// 暂停请求会检测到 Indexing 状态并返回相应错误
		activeTasksMu.Lock()
		delete(activeTasks, batchID)
		activeTasksMu.Unlock()
	}

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

// getAdaptiveConfig 根据系统资源自动计算最优配置
func getAdaptiveConfig() (numWorkers int, numSavers int, bufferSize int, batchSize int) {
	cpuCount := runtime.NumCPU()

	// Worker 配置：核心数 * 2（CPU 密集型清洗任务）
	numWorkers = cpuCount * 2
	if numWorkers < 2 {
		numWorkers = 2
	}

	// Saver 配置：核心数 / 2，最低 2（IO 密集型数据库写入）
	numSavers = cpuCount / 2
	if numSavers < 2 {
		numSavers = 2
	}

	// 内存配置：根据当前堆内存实际占用调整
	// 注意：之前使用 m.Sys 是不对的，因为 Sys 是 Go 从操作系统拿走的总量（只会增），
	// HeapInuse 才是当前正在用的。
	bufferSize = 10000 // 默认
	batchSize = 2000

	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	usedMB := int(m.HeapInuse / 1024 / 1024)

	// 根据内存调整参数
	switch {
	case usedMB > 1500: // 内存压力极大 (针对 2G 机器)
		bufferSize = 1000
		batchSize = 500
	case usedMB > 800: // 内存压力较大
		bufferSize = 3000
		batchSize = 1000
	case usedMB > 300: // 中等负载
		bufferSize = 5000
		batchSize = 1000
	default:
		// 初始状态或高性能机器
		// 10000 的缓冲区足以抵消数据库抖动，且不会产生数以百万计的活跃对象
		bufferSize = 10000
		batchSize = 2000
	}

	log.Printf("[Adaptive] CPU: %d, Workers: %d, Savers: %d, BufferSize: %d, BatchSize: %d (SysMem: %dMB)",
		cpuCount, numWorkers, numSavers, bufferSize, batchSize, usedMB)

	return
}

// processRows 采用高度并发的 Worker Pool 模式处理数据
func (s *CleanerService) processRows(ctx context.Context, iter utils.RowIterator, header []string, batchID uint, indices utils.ColIndices, skipRows int, engine *RuleEngine) (*processStats, error) {
	// 自适应配置
	numWorkers, numSavers, bufferSize, batchSize := getAdaptiveConfig()

	stats := &processStats{rowIdx: 0}
	if skipRows > 0 {
		stats.rowIdx = skipRows
	}

	// 定义内部任务结构
	type task struct {
		row []string
		idx int
	}

	// 准备列名映射，用于规则匹配
	colNames := struct {
		Name    string
		Phone   string
		Address string
		Date    string
	}{
		Name:    getHeaderName(header, indices.Name, "name"),
		Phone:   getHeaderName(header, indices.Phone, "phone"),
		Address: getHeaderName(header, indices.Address, "address"),
		Date:    getHeaderName(header, indices.Date, "date"),
	}

	// Channel 定义，根据可用内存自动调整缓冲区大小
	taskChan := make(chan task, bufferSize)
	resultChan := make(chan model.Record, bufferSize)
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
				rec := s.createRecordFromRow(t.row, batchID, t.idx, indices, colNames, engine)
				if rec.Status == "Clean" {
					atomic.AddInt64(&successCount, 1)
				} else {
					atomic.AddInt64(&failureCount, 1)
				}
				resultChan <- rec
			}
		}()
	}

	// 2. 启动多个数据持久化协程 (并发写入，数量由 getAdaptiveConfig 自动计算)
	var saverWg sync.WaitGroup
	saveDone := make(chan struct{})

	// 启动进度监控协程 (避免多个 Saver 竞争更新数据库)
	monitorDone := make(chan struct{})
	go func() {
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()
		defer close(monitorDone)

		for {
			select {
			case <-ticker.C:
				sCount := atomic.LoadInt64(&successCount)
				fCount := atomic.LoadInt64(&failureCount)
				stats.rowIdx = int(sCount + fCount) // 估算当前总进度

				s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
					Updates(map[string]interface{}{
						"processed_rows": stats.rowIdx,
						"success_count":  int(sCount),
						"failure_count":  int(fCount),
					})
			case <-saveDone: // 所有 Saver 完成后退出
				return
			}
		}
	}()

	for i := 0; i < numSavers; i++ {
		saverWg.Add(1)
		go func() {
			defer saverWg.Done()
			// 预分配切片容量，减少扩容导致的内存内存抖动
			batch := make([]model.Record, 0, batchSize)

			for rec := range resultChan {
				batch = append(batch, rec)

				if len(batch) >= batchSize {
					// 直接使用 GORM 的 Struct 批量创建，框架内部已高度优化
					if err := s.DB.CreateInBatches(batch, batchSize).Error; err != nil {
						log.Printf("[Saver] Bulk insert failed: %v", err)
					}
					// 彻底清空并重置切片，允许 GC 回收对象
					batch = batch[:0]
				}
			}
			if len(batch) > 0 {
				s.DB.CreateInBatches(batch, len(batch))
			}
		}()
	}

	// 专门的协程等待所有 Saver 完成，然后关闭 monitor
	go func() {
		saverWg.Wait()
		close(saveDone)
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

		// 每 10 万行更新一次实时吞吐量（适应不同数据量）
		if stats.rowIdx%100000 == 0 && stats.rowIdx > 0 { // Ensure stats.rowIdx is not 0 for the first log
			elapsed := time.Since(lastLogTime)
			bps := float64(100000) / elapsed.Seconds()
			if stats.rowIdx%1000000 == 0 {
				log.Printf("[Performance] Processed %d rows, current speed: %.2f rows/sec", stats.rowIdx, bps)
			}
			s.batchSpeeds.Store(batchID, bps)
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
		default:
			// Continue processing
		}

		row := iter.Row()
		// 关键优化：不再只是拷贝 slice header，而是克隆每一个单元格的字符串。
		// 这不仅是为了并发安全，更是为了切断对读取器底层大缓冲区的引用。
		rowClone := make([]string, len(row))
		for i, v := range row {
			rowClone[i] = strings.Clone(strings.TrimSpace(v))
		}

		taskChan <- task{
			row: rowClone,
			idx: stats.rowIdx,
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

	// 显式从 sync.Map 中删除 batchID
	s.batchSpeeds.Delete(batchID)

	// 强制 GC + 归还内存（验证用，确认无问题后可移除）
	runtime.GC()
	debug.FreeOSMemory()

	// 打印内存统计，验证内存回收情况
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	log.Printf("[Memory] HeapInUse: %.2f MB | HeapIdle: %.2f MB | HeapReleased: %.2f MB | HeapSys: %.2f MB",
		float64(m.HeapInuse)/1024/1024,
		float64(m.HeapIdle)/1024/1024,
		float64(m.HeapReleased)/1024/1024,
		float64(m.HeapSys)/1024/1024,
	)

	return stats, processErr
}

// createRecordFromRow 从原始行数据创建 Record
func (s *CleanerService) createRecordFromRow(row []string, batchID uint, rowIdx int, indices utils.ColIndices, colNames struct {
	Name    string
	Phone   string
	Address string
	Date    string
}, engine *RuleEngine) model.Record {
	getCol := func(idx int) string {
		if idx >= 0 && idx < len(row) {
			return row[idx]
		}
		return ""
	}
	rawName := getCol(indices.Name)
	rawPhone := getCol(indices.Phone)
	rawAddress := getCol(indices.Address)
	rawDate := getCol(indices.Date)

	rec := model.Record{
		BatchID:  batchID,
		RowIndex: rowIdx,
		Address:  utils.Truncate(rawAddress, 255),
	}

	var errors []string

	// 动态清洗
	cleanName, err := engine.Execute(colNames.Name, rawName)
	if err != nil {
		errors = append(errors, fmt.Sprintf("Name: %v", err))
	}
	rec.Name = utils.Truncate(cleanName, 255)

	cleanPhone, err := engine.Execute(colNames.Phone, rawPhone)
	if err != nil {
		errors = append(errors, fmt.Sprintf("Phone: %v", err))
	}
	rec.Phone = utils.Truncate(cleanPhone, 50)

	cleanDate, err := engine.Execute(colNames.Date, rawDate)
	if err != nil {
		errors = append(errors, fmt.Sprintf("Date: %v", err))
	}
	rec.Date = utils.Truncate(cleanDate, 50)

	// 地址解析 (动态)
	p, _ := engine.Execute("address_province", rawAddress)
	c, _ := engine.Execute("address_city", rawAddress)
	d, _ := engine.Execute("address_district", rawAddress)
	rec.Province = utils.Truncate(p, 100)
	rec.City = utils.Truncate(c, 100)
	rec.District = utils.Truncate(d, 100)

	// 状态判断
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
	activeTasksMu.Unlock()

	if !exists {
		// 任务不在运行中（可能已完成、已取消、或正在索引重建）
		// 检查当前状态，避免覆盖已完成的状态
		var batch model.ImportBatch
		if err := s.DB.First(&batch, batchID).Error; err != nil {
			return fmt.Errorf("batch not found: %w", err)
		}
		if batch.Status == model.BatchStatusCompleted {
			return fmt.Errorf("batch already completed, cannot pause")
		}
		if batch.Status == model.BatchStatusIndexing {
			return fmt.Errorf("batch is in indexing phase, cannot pause")
		}
		if batch.Status == model.BatchStatusPaused {
			return nil // 已经是暂停状态
		}
		return fmt.Errorf("batch is not currently running")
	}

	cancel()
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
	activeTasksMu.Unlock()

	if !exists {
		// 任务不在运行中，检查当前状态
		var batch model.ImportBatch
		if err := s.DB.First(&batch, batchID).Error; err != nil {
			return fmt.Errorf("batch not found: %w", err)
		}
		if batch.Status == model.BatchStatusCompleted {
			return fmt.Errorf("batch already completed, cannot cancel")
		}
		if batch.Status == model.BatchStatusCancelled {
			return nil // 已经是取消状态
		}
		if batch.Status == model.BatchStatusIndexing {
			return fmt.Errorf("batch is in indexing phase, please wait")
		}
		// 对于 Paused 状态，允许取消
		if batch.Status == model.BatchStatusPaused {
			return s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
				Update("status", model.BatchStatusCancelled).Error
		}
		return fmt.Errorf("batch is not currently running")
	}

	cancel()
	return s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
		Update("status", model.BatchStatusCancelled).Error
}

// GetBatchSpeed 获取指定批次当前的实时处理速度
func (s *CleanerService) GetBatchSpeed(batchID uint) float64 {
	if val, ok := s.batchSpeeds.Load(batchID); ok {
		return val.(float64)
	}
	return 0
}

func getHeaderName(header []string, idx int, fallback string) string {
	if idx >= 0 && idx < len(header) {
		return header[idx]
	}
	return fallback
}
