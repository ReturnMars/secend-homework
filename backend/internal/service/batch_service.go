package service

import (
	"etl-tool/internal/model"
	"fmt"
	"log"
	"os"

	"gorm.io/gorm"
)

// CreateBatch 创建一个新的导入批次记录
func (s *CleanerService) CreateBatch(filename string, createdBy string, hash string, path string, rules string) (*model.ImportBatch, error) {
	batch := &model.ImportBatch{
		OriginalFilename: filename,
		FileHash:         hash,
		FilePath:         path,
		Rules:            rules,
		Status:           model.BatchStatusPending,
		CreatedBy:        createdBy,
	}
	err := s.DB.Create(batch).Error
	return batch, err
}

// CreateBatchFromHash 快速创建批次（针对已存在物理文件的情况）
func (s *CleanerService) CreateBatchFromHash(filename string, createdBy string, hash string, rules string) (*model.ImportBatch, error) {
	var existing model.ImportBatch
	if err := s.DB.Where("file_hash = ?", hash).First(&existing).Error; err != nil {
		return nil, fmt.Errorf("physical file not found for hash: %s", hash)
	}

	batch := &model.ImportBatch{
		OriginalFilename: filename,
		FileHash:         hash,
		FilePath:         existing.FilePath, // 复用物理路径
		Rules:            rules,
		Status:           model.BatchStatusPending,
		CreatedBy:        createdBy,
	}
	err := s.DB.Create(batch).Error
	return batch, err
}

// FindBatchByHash 根据文件哈希查找已存在的批次（物理去重模式）
func (s *CleanerService) FindBatchByHash(hash string) (*model.ImportBatch, error) {
	var batch model.ImportBatch
	// 解除对 Status 的限制：只要文件物理 Hash 匹配，就认为持有该文件，跳过网络传输。
	err := s.DB.Where("file_hash = ?", hash).Order("created_at desc").First(&batch).Error
	if err != nil {
		return nil, err
	}
	return &batch, nil
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

// DeleteBatch 删除一个导入批次及其关联的所有数据和文件
func (s *CleanerService) DeleteBatch(id uint) error {
	var batch model.ImportBatch
	if err := s.DB.First(&batch, id).Error; err != nil {
		return err
	}

	// 2. 数据库事务删除
	err := s.DB.Transaction(func(tx *gorm.DB) error {
		// 删除记录版本 (RecordVersion)
		if err := tx.Exec("DELETE FROM record_versions WHERE record_id IN (SELECT id FROM records WHERE batch_id = ?)", id).Error; err != nil {
			return err
		}

		// 删除记录 (Record)
		if err := tx.Where("batch_id = ?", id).Delete(&model.Record{}).Error; err != nil {
			return err
		}

		// 删除批次信息 (ImportBatch)
		if err := tx.Delete(&model.ImportBatch{}, id).Error; err != nil {
			return err
		}

		return nil
	})

	if err != nil {
		return err
	}

	// 3. 物理文件清理 (级联解耦核心：引用计数检查)
	// 只有当没有其他批次引用该文件时，才物理删除
	if batch.FilePath != "" {
		var count int64
		s.DB.Model(&model.ImportBatch{}).Where("file_path = ? AND id <> ?", batch.FilePath, id).Count(&count)

		if count == 0 {
			if err := os.Remove(batch.FilePath); err != nil {
				log.Printf("[Delete] Warning: Failed to remove physical file %s: %v", batch.FilePath, err)
			} else {
				log.Printf("[Delete] Successfully removed last reference and physical file %s", batch.FilePath)
			}
		} else {
			log.Printf("[Delete] Keep physical file %s as it's still referenced by %d other batch(es)", batch.FilePath, count)
		}
	}

	return nil
}
