package service

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"etl-tool/internal/model"
	"etl-tool/internal/repository"
	"etl-tool/internal/utils"

	"github.com/xuri/excelize/v2"
	"gorm.io/gorm"
)

type CleanerService struct {
	DB *gorm.DB
}

func NewCleanerService() *CleanerService {
	return &CleanerService{DB: repository.DB}
}

// ProcessFileAsync starts a goroutine to process the file
func (s *CleanerService) ProcessFileAsync(batchID uint, filePath string) {
	go func() {
		err := s.processFile(batchID, filePath)
		if err != nil {
			log.Printf("Batch %d Failed: %v", batchID, err)
			s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
				Updates(map[string]interface{}{"status": model.BatchStatusFailed})
		}
	}()
}

func (s *CleanerService) processFile(batchID uint, filePath string) error {
	// 1. Update Status to Processing
	s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
		Update("status", model.BatchStatusProcessing)

	// 2. Read File
	rows, err := utils.ReadFile(filePath)
	if err != nil {
		return err
	}
	if len(rows) < 2 {
		return fmt.Errorf("file is empty or missing header")
	}

	// 3. Detect Headers
	header := rows[0]
	indices := utils.DetectHeaders(header)
	if indices.Phone == -1 && indices.Name == -1 {
		return fmt.Errorf("could not detect required columns (Name/Phone)")
	}

	var records []model.Record
	successCount := 0
	failureCount := 0

	// 4. Iterate & Clean
	for i := 1; i < len(rows); i++ {
		row := rows[i]
		if len(row) == 0 {
			continue
		}

		// Safe get helper
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
			RowIndex: i + 1,
			Name:     rawName,
			Address:  rawAddress, // We store original address here if needed, or in RawData?
			// Wait, model has Province/City/District, but no 'Address' field.
			// Let's assume we map 'Address' to 'RawData' or split it immediately.
			// Let's split it.
		}

		// Clean Phone
		cleanPhone, errPhone := CleanPhone(rawPhone)
		rec.Phone = cleanPhone

		// Clean Date
		cleanDate, errDate := CleanDate(rawDate)
		rec.Date = cleanDate

		// Extract Address
		p, c, d := ExtractAddress(rawAddress)
		rec.Province = p
		rec.City = c
		rec.District = d

		// Validate Status
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
			failureCount++
		} else {
			rec.Status = "Clean"
			successCount++
		}

		// Store Raw Data just in case
		// rec.RawData = fmt.Sprintf("%v", row) // simple backup

		records = append(records, rec)

		// Optimization: Bulk Insert every 1000 records
		if len(records) >= 1000 {
			if err := s.DB.Create(&records).Error; err != nil {
				return err
			}
			records = nil // reset

			// Update progress
			s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
				Updates(map[string]interface{}{
					"processed_rows": i,
				})
		}
	}

	// Insert remaining
	if len(records) > 0 {
		if err := s.DB.Create(&records).Error; err != nil {
			return err
		}
	}

	// 5. Update Batch Status and Final Counts
	s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
		Updates(map[string]interface{}{
			"status":        model.BatchStatusCompleted,
			"total_rows":    len(rows) - 1, // exclude header
			"success_count": successCount,
			"failure_count": failureCount,
		})

	return nil
}

func (s *CleanerService) CreateBatch(filename string) (*model.ImportBatch, error) {
	batch := &model.ImportBatch{
		OriginalFilename: filename,
		Status:           model.BatchStatusPending,
	}
	err := s.DB.Create(batch).Error
	return batch, err
}

func (s *CleanerService) GetBatch(id string) (*model.ImportBatch, error) {
	var batch model.ImportBatch
	err := s.DB.First(&batch, "id = ?", id).Error
	return &batch, err
}

func (s *CleanerService) GetRecords(batchID string, filter string, page, pageSize int) ([]model.Record, int64, error) {
	var records []model.Record
	var total int64

	query := s.DB.Model(&model.Record{}).Where("batch_id = ?", batchID)

	if filter == "clean" {
		query = query.Where("status = ?", "Clean")
	} else if filter == "error" {
		query = query.Where("status != ?", "Clean")
	}

	query.Count(&total)

	offset := (page - 1) * pageSize
	err := query.Offset(offset).Limit(pageSize).Order("row_index asc").Find(&records).Error

	return records, total, err
}

// ExportBatch generates an Excel file for the batch
func (s *CleanerService) ExportBatch(batchID string) (string, error) {
	var records []model.Record
	if err := s.DB.Where("batch_id = ?", batchID).Order("row_index asc").Find(&records).Error; err != nil {
		return "", err
	}

	f := excelize.NewFile()
	sheet := "Sheet1"
	f.SetSheetName("Sheet1", sheet)

	// Headers
	headers := []string{"ID", "Name", "Phone", "Date", "Province", "City", "District", "Address", "Status", "Error Message"}
	for i, h := range headers {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		f.SetCellValue(sheet, cell, h)
	}

	// Data
	for i, r := range records {
		rowIdx := i + 2
		f.SetCellValue(sheet, fmt.Sprintf("A%d", rowIdx), r.RowIndex)
		f.SetCellValue(sheet, fmt.Sprintf("B%d", rowIdx), r.Name)
		f.SetCellValue(sheet, fmt.Sprintf("C%d", rowIdx), r.Phone)
		f.SetCellValue(sheet, fmt.Sprintf("D%d", rowIdx), r.Date)
		f.SetCellValue(sheet, fmt.Sprintf("E%d", rowIdx), r.Province)
		f.SetCellValue(sheet, fmt.Sprintf("F%d", rowIdx), r.City)
		f.SetCellValue(sheet, fmt.Sprintf("G%d", rowIdx), r.District)
		f.SetCellValue(sheet, fmt.Sprintf("H%d", rowIdx), r.Address)
		f.SetCellValue(sheet, fmt.Sprintf("I%d", rowIdx), r.Status)
		f.SetCellValue(sheet, fmt.Sprintf("J%d", rowIdx), r.ErrorMessage)
	}

	exportDir := "exports"
	if _, err := os.Stat(exportDir); os.IsNotExist(err) {
		os.Mkdir(exportDir, 0755)
	}

	filename := filepath.Join(exportDir, fmt.Sprintf("batch_%s.xlsx", batchID))
	if err := f.SaveAs(filename); err != nil {
		return "", err
	}

	return filename, nil
}

// GetBatches returns all import batches
func (s *CleanerService) GetBatches() ([]model.ImportBatch, error) {
	var batches []model.ImportBatch
	err := s.DB.Order("created_at desc").Find(&batches).Error
	return batches, err
}

// UpdateRecord updates a record and creates a history version
func (s *CleanerService) UpdateRecord(id string, updates map[string]interface{}, reason string) (*model.Record, error) {
	var record model.Record
	if err := s.DB.First(&record, "id = ?", id).Error; err != nil {
		return nil, err
	}

	// Snapshot before state (simple approach: just dump the struct)
	beforeJSON := fmt.Sprintf("%+v", record) // In prod, use real JSON

	// Apply updates
	if err := s.DB.Model(&record).Updates(updates).Error; err != nil {
		return nil, err
	}

	// Refetch to get new state
	s.DB.First(&record, "id = ?", id)
	afterJSON := fmt.Sprintf("%+v", record)

	// Create Version
	version := model.RecordVersion{
		RecordID:  record.ID,
		Before:    beforeJSON,
		After:     afterJSON,
		ChangedAt: time.Now(),
		Reason:    reason,
	}
	s.DB.Create(&version)

	return &record, nil
}

// GetRecordHistory returns version history for a record
func (s *CleanerService) GetRecordHistory(recordID string) ([]model.RecordVersion, error) {
	var versions []model.RecordVersion
	err := s.DB.Where("record_id = ?", recordID).Order("changed_at desc").Find(&versions).Error
	return versions, err
}
