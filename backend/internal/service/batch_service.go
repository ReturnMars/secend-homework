package service

import (
	"etl-tool/internal/model"
)

// CreateBatch 创建一个新的导入批次记录
func (s *CleanerService) CreateBatch(filename string, createdBy string) (*model.ImportBatch, error) {
	batch := &model.ImportBatch{
		OriginalFilename: filename,
		Status:           model.BatchStatusPending,
		CreatedBy:        createdBy,
	}
	err := s.DB.Create(batch).Error
	return batch, err
}

// GetBatch 根据 ID 获取批次信息
func (s *CleanerService) GetBatch(id string) (*model.ImportBatch, error) {
	var batch model.ImportBatch
	err := s.DB.First(&batch, "id = ?", id).Error
	return &batch, err
}

// GetBatches 获取所有导入批次，可选按用户过滤
func (s *CleanerService) GetBatches(username string) ([]model.ImportBatch, error) {
	var batches []model.ImportBatch
	query := s.DB.Order("created_at desc")
	if username != "" {
		query = query.Where("created_by = ?", username)
	}
	err := query.Find(&batches).Error
	return batches, err
}

// UpdateBatchName 更新批次的原始文件名
func (s *CleanerService) UpdateBatchName(id string, newName string) error {
	return s.DB.Model(&model.ImportBatch{}).Where("id = ?", id).Update("original_filename", newName).Error
}
