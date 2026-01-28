// internal/service/queue.go - Task Queue Service
package service

import (
	"context"
	"encoding/json"
	"etl-tool/internal/infrastructure/redis"
	"fmt"
	"time"
)

const QueueKey = "tasks:file_processing"

type FileTask struct {
	BatchID  uint   `json:"batch_id"`
	FilePath string `json:"file_path"`
}

type QueueService struct{}

func NewQueueService() *QueueService {
	return &QueueService{}
}

// EnqueueTask adds a file processing task to the redis list
func (s *QueueService) EnqueueTask(batchID uint, filePath string) error {
	if redis.Client == nil {
		return fmt.Errorf("redis client not initialized")
	}

	task := FileTask{
		BatchID:  batchID,
		FilePath: filePath,
	}
	data, err := json.Marshal(task)
	if err != nil {
		return err
	}
	return redis.Client.RPush(context.Background(), QueueKey, data).Err()
}

// DequeueTask waits for a task from the redis list (blocking)
func (s *QueueService) DequeueTask(timeout time.Duration) (*FileTask, error) {
	if redis.Client == nil {
		return nil, fmt.Errorf("redis client not initialized")
	}

	// BLPOP returns: [key, value]
	result, err := redis.Client.BLPop(context.Background(), timeout, QueueKey).Result()
	if err != nil {
		return nil, err
	}

	if len(result) < 2 {
		return nil, fmt.Errorf("invalid redis response")
	}

	var task FileTask
	if err := json.Unmarshal([]byte(result[1]), &task); err != nil {
		return nil, err
	}
	return &task, nil
}
