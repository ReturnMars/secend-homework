package service

import (
	"bufio"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"

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
		err := s.processFileStream(batchID, filePath)
		if err != nil {
			log.Printf("Batch %d Failed: %v", batchID, err)
			s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
				Updates(map[string]interface{}{"status": model.BatchStatusFailed})
		}
	}()
}

// Helper to safely truncate strings to fit DB columns
func truncate(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

func countLines(path string) (int, error) {
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

// processFileStream processes the file using a stream iterator to save memory
func (s *CleanerService) processFileStream(batchID uint, filePath string) error {
	// 1. Estimate Total Rows
	totalLines, _ := countLines(filePath)
	if totalLines > 0 {
		totalLines-- // exclude header approximation
	}

	// 2. Update Status and Total Rows
	s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
		Updates(map[string]interface{}{
			"status":     model.BatchStatusProcessing,
			"total_rows": totalLines,
		})

	// 3. Open File Stream
	iter, err := utils.NewRowIterator(filePath)
	if err != nil {
		return err
	}
	defer iter.Close()

	// 3. Read Header
	if !iter.Next() {
		if err := iter.Err(); err != nil {
			log.Printf("DEBUG: Header read error: %v", err)
			return err
		}
		return fmt.Errorf("file is empty or missing header")
	}
	header := iter.Row()

	if len(header) > 0 {
		header[0] = strings.TrimPrefix(header[0], "\xEF\xBB\xBF")
	}

	indices := utils.DetectHeaders(header)

	if indices.Phone == -1 && indices.Name == -1 {
		return fmt.Errorf("could not detect required columns (Name/Phone). Header was: %v", header)
	}

	var records []model.Record
	successCount := 0
	failureCount := 0
	rowIdx := 1 // Start at 1 because we consumed header

	// 4. Iterate & Clean
	for iter.Next() {
		rowIdx++
		row := iter.Row()

		if len(row) == 0 {
			continue
		}

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
			Name:     truncate(rawName, 255),
			Address:  truncate(rawAddress, 255),
		}

		cleanPhone, errPhone := CleanPhone(rawPhone)
		rec.Phone = truncate(cleanPhone, 50)
		cleanDate, errDate := CleanDate(rawDate)
		rec.Date = truncate(cleanDate, 50)

		p, c, d := ExtractAddress(rawAddress)
		rec.Province = truncate(p, 100)
		rec.City = truncate(c, 100)
		rec.District = truncate(d, 100)

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

		records = append(records, rec)

		if len(records) >= 1000 {
			if err := s.DB.Create(&records).Error; err != nil {
				return err
			}
			records = nil
			s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
				Updates(map[string]interface{}{"processed_rows": rowIdx})
		}
	}

	if err := iter.Err(); err != nil {
		return err
	}

	if len(records) > 0 {
		if err := s.DB.Create(&records).Error; err != nil {
			return err
		}
	}

	return s.DB.Model(&model.ImportBatch{}).Where("id = ?", batchID).
		Updates(map[string]interface{}{
			"status":         model.BatchStatusCompleted,
			"processed_rows": rowIdx,
			"total_rows":     rowIdx,
			"success_count":  successCount,
			"failure_count":  failureCount,
			"completed_at":   time.Now(),
		}).Error
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

// GetBatchFilename returns the download filename for a batch
func (s *CleanerService) GetBatchFilename(batchID string) (string, error) {
	var batch model.ImportBatch
	if err := s.DB.First(&batch, "id = ?", batchID).Error; err != nil {
		return "", err
	}

	// Return original filename (handler decides format based on extension)
	return batch.OriginalFilename, nil
}

// ExportBatchStream streams the batch data as CSV to the provided writer
func (s *CleanerService) ExportBatchStream(batchID string, w io.Writer) error {
	// 1. Write BOM check (for Excel UTF-8 compatibility)
	w.Write([]byte("\xEF\xBB\xBF"))

	cw := csv.NewWriter(w)

	// 2. Write Headers
	headers := []string{"Row Index", "Name", "Phone", "Date", "Province", "City", "District", "Address", "Status", "Error Message"}
	if err := cw.Write(headers); err != nil {
		return err
	}
	cw.Flush()

	// 3. Stream Rows from DB
	rows, err := s.DB.Model(&model.Record{}).
		Where("batch_id = ?", batchID).
		Order("row_index asc").
		Rows()

	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var r model.Record
		// Scan directly into struct
		s.DB.ScanRows(rows, &r)

		// Write CSV Row
		record := []string{
			fmt.Sprintf("%d", r.RowIndex),
			r.Name,
			r.Phone,
			r.Date,
			r.Province,
			r.City,
			r.District,
			r.Address,
			string(r.Status),
			r.ErrorMessage,
		}

		if err := cw.Write(record); err != nil {
			return err
		}

		// Periodic flushing is usually handled by csv.Writer buffer,
		// but we can check errors periodically if needed.
	}

	cw.Flush()
	return cw.Error()
}

// ExportBatchWithExcelStream streams the batch data as Excel (xlsx)
func (s *CleanerService) ExportBatchWithExcelStream(batchID string, w io.Writer) error {
	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {
			fmt.Printf("Error closing excel file: %v\n", err)
		}
	}()

	// Use StreamWriter for high-performance writing
	sw, err := f.NewStreamWriter("Sheet1")
	if err != nil {
		return err
	}

	// Write Headers
	headers := []interface{}{"Row Index", "Name", "Phone", "Date", "Province", "City", "District", "Address", "Status", "Error Message"}
	if err := sw.SetRow("A1", headers); err != nil {
		return err
	}

	// Stream Rows from DB
	rows, err := s.DB.Model(&model.Record{}).
		Where("batch_id = ?", batchID).
		Order("row_index asc").
		Rows()

	if err != nil {
		return err
	}
	defer rows.Close()

	currentRow := 2
	for rows.Next() {
		var r model.Record
		s.DB.ScanRows(rows, &r)

		// Excel row data
		values := []interface{}{
			r.RowIndex,
			r.Name,
			r.Phone,
			r.Date,
			r.Province,
			r.City,
			r.District,
			r.Address,
			string(r.Status),
			r.ErrorMessage,
		}

		cell, _ := excelize.CoordinatesToCellName(1, currentRow)
		if err := sw.SetRow(cell, values); err != nil {
			return err
		}
		currentRow++

		// Check Excel Row Limit (1,048,576)
		if currentRow > 1048576 {
			// Simply stop for now. Multi-sheet support makes this much more complex.
			log.Println("Warning: Excel row limit reached, truncating data.")
			break
		}
	}

	if err := sw.Flush(); err != nil {
		return err
	}

	// Write to io.Writer (the HTTP response)
	_, err = f.WriteTo(w)
	return err
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
