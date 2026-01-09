package service

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"etl-tool/internal/model"
)

// GetRecords 获取批次下的记录，支持过滤、搜索和分页
func (s *CleanerService) GetRecords(batchID string, filter string, search string, page, pageSize int) ([]model.Record, int64, error) {
	var records []model.Record
	var total int64

	query := s.DB.Model(&model.Record{}).Where("batch_id = ?", batchID)

	switch filter {
	case "clean":
		query = query.Where("status = ?", "Clean")
	case "error":
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

// UpdateRecord 更新记录并创建历史版本
func (s *CleanerService) UpdateRecord(id string, updates map[string]interface{}, reason string) (*model.Record, error) {
	var record model.Record
	if err := s.DB.First(&record, "id = ?", id).Error; err != nil {
		return nil, err
	}

	// 变更检测：检查更新是否实际改变内容
	if !s.hasChanges(&record, updates) {
		return nil, fmt.Errorf("NO_CHANGES_DETECTED")
	}

	// 快照更新前状态
	beforeBytes, _ := json.Marshal(record)
	beforeJSON := string(beforeBytes)

	// 应用更新
	if err := s.DB.Model(&record).Updates(updates).Error; err != nil {
		return nil, err
	}

	// 重新获取更新后的状态
	s.DB.First(&record, "id = ?", id)
	afterBytes, _ := json.Marshal(record)
	afterJSON := string(afterBytes)

	// 创建版本记录
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

// hasChanges 检查更新是否会实际修改记录
func (s *CleanerService) hasChanges(record *model.Record, updates map[string]interface{}) bool {
	for k, v := range updates {
		currentVal := s.getRecordFieldValue(record, k)
		if fmt.Sprintf("%v", v) != currentVal {
			return true
		}
	}
	return false
}

// getRecordFieldValue 根据字段名获取记录的当前值
func (s *CleanerService) getRecordFieldValue(record *model.Record, field string) string {
	switch field {
	case "name":
		return record.Name
	case "phone":
		return record.Phone
	case "date":
		return record.Date
	case "city":
		return record.City
	case "province":
		return record.Province
	case "district":
		return record.District
	case "address":
		return record.Address
	default:
		return ""
	}
}

// UpdateVersionReason 仅修改特定版本的修改原因
func (s *CleanerService) UpdateVersionReason(versionID string, newReason string) error {
	return s.DB.Model(&model.RecordVersion{}).Where("id = ?", versionID).Update("reason", newReason).Error
}

// RollbackRecord 将记录恢复到目标版本的状态
func (s *CleanerService) RollbackRecord(recordID, versionID string) (*model.Record, error) {
	var record model.Record
	if err := s.DB.First(&record, "id = ?", recordID).Error; err != nil {
		return nil, err
	}

	var version model.RecordVersion
	if err := s.DB.First(&version, "id = ? AND record_id = ?", versionID, recordID).Error; err != nil {
		return nil, fmt.Errorf("version not found")
	}

	// 快照回滚前状态
	beforeBytes, _ := json.Marshal(record)
	beforeJSON := string(beforeBytes)

	// 判断是撤销最新更改还是恢复到旧版本
	targetJSON, reason := s.determineRollbackTarget(&version, recordID)

	// 解析目标状态
	targetData, err := s.smartUnmarshal(targetJSON)
	if err != nil {
		fmt.Printf("ROLLBACK_ERROR: Failed to unmarshal version %d target data. Content: %s\n", version.ID, targetJSON)
		return nil, fmt.Errorf("failed to parse version data (ID: %d): %v", version.ID, err)
	}

	// 构建更新字段
	updates := s.buildRollbackUpdates(targetData)

	if err := s.DB.Model(&record).Updates(updates).Error; err != nil {
		return nil, err
	}

	// 确认更新
	s.DB.First(&record, "id = ?", recordID)
	afterBytes, _ := json.Marshal(record)
	afterJSON := string(afterBytes)

	// 创建回滚版本记录
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

// determineRollbackTarget 确定回滚的目标状态和原因
func (s *CleanerService) determineRollbackTarget(version *model.RecordVersion, recordID string) (string, string) {
	var newerCount int64
	s.DB.Model(&model.RecordVersion{}).Where("record_id = ? AND id > ?", recordID, version.ID).Count(&newerCount)

	if newerCount == 0 {
		// 目标是最新版本，"回滚"意味着"撤销此更改"
		return version.Before, fmt.Sprintf("Undo (Revert) Change #%d", version.ID)
	}
	// 目标是旧版本，"回滚"意味着"恢复到此状态"
	return version.After, fmt.Sprintf("Restore to State #%d", version.ID)
}

// buildRollbackUpdates 构建回滚操作的更新字段映射
func (s *CleanerService) buildRollbackUpdates(targetData map[string]interface{}) map[string]interface{} {
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

	// 清理空值
	for k, v := range updates {
		if v == nil {
			delete(updates, k)
		}
	}
	return updates
}

// GetRecordHistory 获取记录的版本历史
func (s *CleanerService) GetRecordHistory(recordID string) ([]model.RecordVersion, error) {
	var versions []model.RecordVersion
	err := s.DB.Where("record_id = ?", recordID).Order("changed_at desc").Find(&versions).Error
	return versions, err
}

// smartUnmarshal 处理 JSON 和旧版 Go 结构体格式的数据
func (s *CleanerService) smartUnmarshal(data string) (map[string]interface{}, error) {
	// 检查空字符串
	if strings.TrimSpace(data) == "" {
		return nil, fmt.Errorf("empty version data")
	}

	// 先尝试标准 JSON
	var res map[string]interface{}
	if err := json.Unmarshal([]byte(data), &res); err == nil {
		// 检查 JSON 解析结果是否为空
		if len(res) == 0 {
			return nil, fmt.Errorf("empty JSON object")
		}
		return res, nil
	}

	// 回退处理 Go 结构体格式: {Key:Value, Key:Value}
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
