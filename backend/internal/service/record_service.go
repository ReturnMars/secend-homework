package service

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"etl-tool/internal/config"
	"etl-tool/internal/model"

	"gorm.io/gorm"
)

// GetRecords 获取批次下的记录，支持过滤、搜索和分页
func (s *CleanerService) GetRecords(batchID string, filter string, search string, page, pageSize int) ([]model.Record, int64, error) {
	var records []model.Record
	search = strings.TrimSpace(search)

	query := s.DB.Model(&model.Record{}).Where("batch_id = ?", batchID)
	query = s.applyStatusFilter(query, filter)
	query = s.applySearchFilter(query, search)

	total := s.countRecords(query, batchID, filter, search)

	offset := (page - 1) * pageSize
	err := query.Offset(offset).Limit(pageSize).Order("row_index asc").Find(&records).Error

	return records, total, err
}

// applyStatusFilter 应用状态过滤条件
func (s *CleanerService) applyStatusFilter(query *gorm.DB, filter string) *gorm.DB {
	switch filter {
	case "clean":
		return query.Where("status = ?", "Clean")
	case "error":
		return query.Where("status != ?", "Clean")
	default:
		return query
	}
}

// applySearchFilter 应用搜索条件
func (s *CleanerService) applySearchFilter(query *gorm.DB, search string) *gorm.DB {
	if search == "" {
		return query
	}

	if s.isNumericSearch(search) {
		return query.Where("phone LIKE ?", search+"%")
	}

	pattern := search + "%"
	return query.Where(
		"name LIKE ? OR province LIKE ? OR city LIKE ? OR district LIKE ?",
		pattern, pattern, pattern, pattern,
	)
}

// isNumericSearch 判断是否为纯数字搜索（用于手机号）
func (s *CleanerService) isNumericSearch(search string) bool {
	if len(search) < 3 {
		return false
	}
	for _, c := range search {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// countRecords 优化的计数逻辑
func (s *CleanerService) countRecords(query *gorm.DB, batchID, filter, search string) int64 {
	// 无过滤无搜索：直接从 batch 表读取总行数，性能完美 (O(1))
	if filter == "all" && search == "" {
		var batch model.ImportBatch
		if err := s.DB.Select("total_rows").First(&batch, "id = ?", batchID).Error; err == nil {
			return int64(batch.TotalRows)
		}
	}

	// 有过滤或搜索：执行数据库 Count，由于使用了索引覆盖，性能依然优秀
	var total int64
	query.Count(&total)
	return total
}

// ValidateRecordUpdate 预先验证更新结果，回显状态变化
func (s *CleanerService) ValidateRecordUpdate(id string, updates map[string]interface{}) (map[string]interface{}, error) {
	var record model.Record
	if err := s.DB.First(&record, "id = ?", id).Error; err != nil {
		return nil, err
	}

	// 获取对应批次的规则
	var batch model.ImportBatch
	if err := s.DB.First(&batch, record.BatchID).Error; err != nil {
		return nil, fmt.Errorf("could not find batch for validation")
	}

	engine := NewRuleEngine()
	if batch.Rules != "" {
		engine.LoadConfig([]byte(batch.Rules))
	} else if config.AppConfig != nil && config.AppConfig.CleaningRules != nil {
		jsonData, _ := json.Marshal(config.AppConfig.CleaningRules)
		engine.LoadConfig(jsonData)
	}

	// 准备合并后的数据进行验证
	newPhone := record.Phone
	if v, ok := updates["phone"].(string); ok {
		newPhone = v
	}
	newDate := record.Date
	if v, ok := updates["date"].(string); ok {
		newDate = v
	}
	newName := record.Name
	if v, ok := updates["name"].(string); ok {
		newName = v
	}

	var errors []string
	cleanName, err := engine.Execute("name", newName)
	if err != nil {
		errors = append(errors, fmt.Sprintf("Name: %v", err))
	}
	cleanPhone, err := engine.Execute("phone", newPhone)
	if err != nil {
		errors = append(errors, fmt.Sprintf("Phone: %v", err))
	}
	cleanDate, err := engine.Execute("date", newDate)
	if err != nil {
		errors = append(errors, fmt.Sprintf("Date: %v", err))
	}

	newStatus := "Clean"
	newError := ""
	if len(errors) > 0 {
		newStatus = "Error"
		newError = fmt.Sprintf("%v", errors)
	}

	return map[string]interface{}{
		"current_status": record.Status,
		"new_status":     newStatus,
		"new_error":      newError,
		"has_changes":    s.hasChanges(&record, updates),
		"cleaned_values": map[string]string{
			"name":  cleanName,
			"phone": cleanPhone,
			"date":  cleanDate,
		},
	}, nil
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

	// 提取并清洗数据，准备同步状态
	phone := record.Phone
	if v, ok := updates["phone"].(string); ok {
		phone = v
	}
	date := record.Date
	if v, ok := updates["date"].(string); ok {
		date = v
	}
	name := record.Name
	if v, ok := updates["name"].(string); ok {
		name = v
	}

	// 获取对应批次的规则
	var batch model.ImportBatch
	if err := s.DB.First(&batch, record.BatchID).Error; err != nil {
		return nil, fmt.Errorf("could not find batch for rule validation")
	}

	engine := NewRuleEngine()
	if batch.Rules != "" {
		engine.LoadConfig([]byte(batch.Rules))
	} else if config.AppConfig != nil && config.AppConfig.CleaningRules != nil {
		jsonData, _ := json.Marshal(config.AppConfig.CleaningRules)
		engine.LoadConfig(jsonData)
	}

	// 尝试清洗数据以持久化更好的格式
	cleanedPhone, phoneErr := engine.Execute("phone", phone)
	cleanedDate, dateErr := engine.Execute("date", date)
	cleanedName, nameErr := engine.Execute("name", name)

	// 计算新状态
	var errors []string
	if nameErr != nil {
		errors = append(errors, fmt.Sprintf("Name: %v", nameErr))
	}
	if phoneErr != nil {
		errors = append(errors, fmt.Sprintf("Phone: %v", phoneErr))
	}
	if dateErr != nil {
		errors = append(errors, fmt.Sprintf("Date: %v", dateErr))
	}

	newStatus := "Clean"
	newError := ""
	if len(errors) > 0 {
		newStatus = "Error"
		newError = fmt.Sprintf("%v", errors)
	}

	// 如果清洗成功，使用清洗后的值更新 map 以便存入数据库
	updates["phone"] = cleanedPhone
	updates["date"] = cleanedDate
	updates["name"] = cleanedName
	updates["status"] = newStatus
	updates["error_message"] = newError

	// 应用所有更新（包括状态字段）
	if err := s.DB.Model(&record).Updates(updates).Error; err != nil {
		return nil, err
	}

	// 重新获取更新后的完整记录（包括 ID 和行索引等，以及 GORM 更新后的字段）
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
