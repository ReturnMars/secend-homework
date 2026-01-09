package service

import (
	"fmt"
	"log"
	"strings"
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
			log.Printf("Batch %d Failed: %v", batchID, err)
			s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
				Updates(map[string]interface{}{"status": model.BatchStatusFailed})
		}
	}()
}

// processFileStream 使用流式迭代器处理文件以节省内存
func (s *CleanerService) processFileStream(batchID uint, filePath string) error {
	// 1. 估算总行数
	totalLines, _ := utils.CountLines(filePath)
	if totalLines > 0 {
		totalLines-- // 排除表头
	}

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

	// 5. 处理数据行
	stats, err := s.processRows(iter, batchID, indices)
	if err != nil {
		return err
	}

	// 6. 更新批量状态为已完成
	return s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
		Updates(map[string]interface{}{
			"status":         model.BatchStatusCompleted,
			"processed_rows": stats.rowIdx,
			"total_rows":     stats.rowIdx,
			"success_count":  stats.successCount,
			"failure_count":  stats.failureCount,
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
	rowIdx       int
	successCount int
	failureCount int
}

// processRows 遍历数据行并创建记录
func (s *CleanerService) processRows(iter utils.RowIterator, batchID uint, indices utils.ColIndices) (*processStats, error) {
	var records []model.Record
	stats := &processStats{rowIdx: 1}

	for iter.Next() {
		stats.rowIdx++
		row := iter.Row()

		if len(row) == 0 {
			continue
		}

		rec := s.createRecordFromRow(row, batchID, stats.rowIdx, indices)

		if rec.Status == "Clean" {
			stats.successCount++
		} else {
			stats.failureCount++
		}

		records = append(records, rec)

		// 批量插入优化：每 1000 条记录写入一次
		if len(records) >= 1000 {
			if err := s.flushRecords(&records, batchID, stats.rowIdx); err != nil {
				return nil, err
			}
		}
	}

	if err := iter.Err(); err != nil {
		return nil, err
	}

	// 插入剩余记录
	if len(records) > 0 {
		if err := s.DB.Create(&records).Error; err != nil {
			return nil, err
		}
	}

	return stats, nil
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

// flushRecords 将记录写入数据库并更新进度
func (s *CleanerService) flushRecords(records *[]model.Record, batchID uint, processedRows int) error {
	if err := s.DB.Create(records).Error; err != nil {
		return err
	}
	*records = nil
	s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
		Updates(map[string]interface{}{"processed_rows": processedRows})
	return nil
}
