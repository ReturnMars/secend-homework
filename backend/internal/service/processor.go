package service

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
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

// UpdateBatchName updates the original filename of a batch
func (s *CleanerService) UpdateBatchName(id string, newName string) error {
	return s.DB.Model(&model.ImportBatch{}).Where("id = ?", id).Update("original_filename", newName).Error
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

		rawName := strings.TrimSpace(getCol(indices.Name))
		rawPhone := strings.TrimSpace(getCol(indices.Phone))
		rawAddress := strings.TrimSpace(getCol(indices.Address))
		rawDate := strings.TrimSpace(getCol(indices.Date))

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

func (s *CleanerService) CreateBatch(filename string, createdBy string) (*model.ImportBatch, error) {
	batch := &model.ImportBatch{
		OriginalFilename: filename,
		Status:           model.BatchStatusPending,
		CreatedBy:        createdBy,
	}
	err := s.DB.Create(batch).Error
	return batch, err
}

func (s *CleanerService) GetBatch(id string) (*model.ImportBatch, error) {
	var batch model.ImportBatch
	err := s.DB.First(&batch, "id = ?", id).Error
	return &batch, err
}

func (s *CleanerService) GetRecords(batchID string, filter string, search string, page, pageSize int) ([]model.Record, int64, error) {
	var records []model.Record
	var total int64

	query := s.DB.Model(&model.Record{}).Where("batch_id = ?", batchID)

	if filter == "clean" {
		query = query.Where("status = ?", "Clean")
	} else if filter == "error" {
		query = query.Where("status != ?", "Clean")
	}

	if search != "" {
		sPattern := "%" + search + "%"
		query = query.Where("(name LIKE ? OR phone LIKE ? OR date LIKE ? OR address LIKE ? OR province LIKE ? OR city LIKE ? OR district LIKE ? OR error_message LIKE ?)",
			sPattern, sPattern, sPattern, sPattern, sPattern, sPattern, sPattern, sPattern)
	}

	query.Count(&total)

	offset := (page - 1) * pageSize
	err := query.Offset(offset).Limit(pageSize).Order("row_index asc").Find(&records).Error

	return records, total, err
}

// ExportBatch generates an Excel file for the batch
func (s *CleanerService) ExportBatch(batchID string) (string, string, error) {
	var batch model.ImportBatch
	if err := s.DB.First(&batch, "id = ?", batchID).Error; err != nil {
		return "", "", err
	}

	var records []model.Record
	if err := s.DB.Where("batch_id = ?", batchID).Order("row_index asc").Find(&records).Error; err != nil {
		return "", "", err
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
		return "", "", err
	}

	// For the download name, replace .csv with .xlsx if it's currently .csv
	downloadName := batch.OriginalFilename
	ext := filepath.Ext(downloadName)
	if strings.ToLower(ext) == ".csv" {
		downloadName = strings.TrimSuffix(downloadName, ext) + ".xlsx"
	} else if ext == "" {
		downloadName = downloadName + ".xlsx"
	}

	return filename, downloadName, nil
}

// GetBatches returns all import batches, optionally filtering by user
func (s *CleanerService) GetBatches(username string) ([]model.ImportBatch, error) {
	var batches []model.ImportBatch
	query := s.DB.Order("created_at desc")
	if username != "" {
		query = query.Where("created_by = ?", username)
	}
	err := query.Find(&batches).Error
	return batches, err
}

// UpdateRecord updates a record and creates a history version
func (s *CleanerService) UpdateRecord(id string, updates map[string]interface{}, reason string) (*model.Record, error) {
	var record model.Record
	if err := s.DB.First(&record, "id = ?", id).Error; err != nil {
		return nil, err
	}

	// Change Detection: Check if updates actually change anything
	hasChanges := false
	for k, v := range updates {
		// Simple comparison for basic types
		currentVal := ""
		switch k {
		case "name":
			currentVal = record.Name
		case "phone":
			currentVal = record.Phone
		case "date":
			currentVal = record.Date
		case "city":
			currentVal = record.City
		case "province":
			currentVal = record.Province
		case "district":
			currentVal = record.District
		case "address":
			currentVal = record.Address
		}
		if fmt.Sprintf("%v", v) != currentVal {
			hasChanges = true
			break
		}
	}

	if !hasChanges {
		return nil, fmt.Errorf("NO_CHANGES_DETECTED")
	}

	// Snapshot before state using JSON
	beforeBytes, _ := json.Marshal(record)
	beforeJSON := string(beforeBytes)

	// Apply updates
	if err := s.DB.Model(&record).Updates(updates).Error; err != nil {
		return nil, err
	}

	// Refetch to get new state
	s.DB.First(&record, "id = ?", id)
	afterBytes, _ := json.Marshal(record)
	afterJSON := string(afterBytes)

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

// UpdateVersionReason modifies only the reason for a specific version
func (s *CleanerService) UpdateVersionReason(versionID string, newReason string) error {
	return s.DB.Model(&model.RecordVersion{}).Where("id = ?", versionID).Update("reason", newReason).Error
}

// RollbackRecord restores a record to a target version's state
func (s *CleanerService) RollbackRecord(recordID, versionID string) (*model.Record, error) {
	var record model.Record
	if err := s.DB.First(&record, "id = ?", recordID).Error; err != nil {
		return nil, err
	}

	var version model.RecordVersion
	if err := s.DB.First(&version, "id = ? AND record_id = ?", versionID, recordID).Error; err != nil {
		return nil, fmt.Errorf("version not found")
	}

	// Snapshot current state before rollback
	beforeBytes, _ := json.Marshal(record)
	beforeJSON := string(beforeBytes)

	// Determine if we are rolling back the latest version (Undo) or restoring an old version
	var newerCount int64
	s.DB.Model(&model.RecordVersion{}).Where("record_id = ? AND id > ?", recordID, version.ID).Count(&newerCount)

	var targetJSON string
	var reason string

	if newerCount == 0 {
		// Target is the latest version. "Rollback" here implies "Undo this change".
		// So we want to go back to the state BEFORE this version.
		targetJSON = version.Before
		reason = fmt.Sprintf("Undo Rev %d (Version ID: %d)", version.ID, version.ID) // Assuming ID is usable, but it's string in args, uint in struct.
		// Wait, args are string, struct is uint. Let's use version.ID (uint) directly in Sprintf
		reason = fmt.Sprintf("Undo (Revert) Change #%d", version.ID)

	} else {
		// Target is an older version. "Rollback" implies "Restore to this state".
		// So we want the state AFTER this version.
		targetJSON = version.After
		reason = fmt.Sprintf("Restore to State #%d", version.ID)
	}

	// Parse the target state
	targetData, err := s.smartUnmarshal(targetJSON)
	if err != nil {
		fmt.Printf("ROLLBACK_ERROR: Failed to unmarshal version %d target data. Content: %s\n", version.ID, targetJSON)
		return nil, fmt.Errorf("failed to parse version data (ID: %d): %v", version.ID, err)
	}

	// Update the record fields. We only update data fields, keeping ID and BatchID.
	updates := map[string]interface{}{
		"name":          targetData["name"],
		"phone":         targetData["phone"],
		"date":          targetData["date"],
		"province":      targetData["province"],
		"city":          targetData["city"],
		"district":      targetData["district"],
		"status":        targetData["status"],
		"error_message": targetData["error_message"],
	}

	// Clean updates: GORM needs correct types or it might fail if values are missing
	for k, v := range updates {
		if v == nil {
			delete(updates, k)
		}
	}

	if err := s.DB.Model(&record).Updates(updates).Error; err != nil {
		return nil, err
	}

	// Refetch to confirm
	s.DB.First(&record, "id = ?", recordID)
	afterBytes, _ := json.Marshal(record)
	afterJSON := string(afterBytes)

	// Create a new version for the rollback action
	rollbackVersion := model.RecordVersion{
		RecordID:  record.ID,
		Before:    beforeJSON,
		After:     afterJSON,
		ChangedAt: time.Now(),
		Reason:    reason,
	}
	s.DB.Create(&rollbackVersion)

	return &record, nil
}

// GetRecordHistory returns version history for a record
func (s *CleanerService) GetRecordHistory(recordID string) ([]model.RecordVersion, error) {
	var versions []model.RecordVersion
	err := s.DB.Where("record_id = ?", recordID).Order("changed_at desc").Find(&versions).Error
	return versions, err
}

// smartUnmarshal handles both JSON and legacy Go struct formatted data
func (s *CleanerService) smartUnmarshal(data string) (map[string]interface{}, error) {
	// Try standard JSON first
	var res map[string]interface{}
	if err := json.Unmarshal([]byte(data), &res); err == nil {
		return res, nil
	}

	// Fallback for Go struct format: {Key:Value, Key:Value}
	// This happens if data was stored via fmt.Sprintf("%+v", struct)
	res = make(map[string]interface{})
	clean := strings.Trim(data, "{}")
	if clean == "" {
		return nil, fmt.Errorf("empty version data")
	}

	parts := strings.Split(clean, ",")
	for _, part := range parts {
		kv := strings.SplitN(part, ":", 2)
		if len(kv) == 2 {
			key := strings.ToLower(strings.TrimSpace(kv[0]))
			val := strings.TrimSpace(kv[1])
			res[key] = val
		}
	}

	if len(res) == 0 {
		return nil, fmt.Errorf("invalid data format")
	}
	return res, nil
}
