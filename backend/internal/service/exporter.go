package service

import (
	"encoding/csv"
	"fmt"
	"io"
	"log"

	"etl-tool/internal/model"

	"github.com/xuri/excelize/v2"
)

// GetBatchFilename 获取批次的下载文件名
func (s *CleanerService) GetBatchFilename(batchID string) (string, error) {
	var batch model.ImportBatch
	if err := s.DB.First(&batch, "id = ?", batchID).Error; err != nil {
		return "", err
	}
	return batch.OriginalFilename, nil
}

// ExportBatchStream 将批次数据以 CSV 格式流式输出到 writer
func (s *CleanerService) ExportBatchStream(batchID string, filter string, w io.Writer) error {
	// 写入 BOM 标记 (Excel UTF-8 兼容性)
	w.Write([]byte("\xEF\xBB\xBF"))

	cw := csv.NewWriter(w)

	// 写入表头
	headers := []string{"行号", "姓名", "手机号", "日期", "省份", "城市", "区县", "地址", "状态", "错误信息"}
	if err := cw.Write(headers); err != nil {
		return err
	}
	cw.Flush()

	// 核心逻辑：应用导出过滤器
	query := s.DB.Model(&model.Record{}).Where("batch_id = ?", batchID)
	switch filter {
	case "clean":
		query = query.Where("status = ?", "Clean")
	case "error":
		query = query.Where("status != ?", "Clean")
	}

	rows, err := query.Order("row_index asc").Rows()
	if err != nil {
		return err
	}
	defer rows.Close()

	// 逐行写入 CSV
	for rows.Next() {
		var r model.Record
		s.DB.ScanRows(rows, &r)

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
	}

	cw.Flush()
	return cw.Error()
}

// ExportBatchWithExcelStream 将批次数据以 Excel (xlsx) 格式流式输出
func (s *CleanerService) ExportBatchWithExcelStream(batchID string, filter string, w io.Writer) error {
	f := excelize.NewFile()
	defer func() {
		if err := f.Close(); err != nil {
			fmt.Printf("关闭 Excel 文件时出错: %v\n", err)
		}
	}()

	// 使用 StreamWriter 实现高性能写入
	sw, err := f.NewStreamWriter("Sheet1")
	if err != nil {
		return err
	}

	// 写入表头
	headers := []interface{}{"行号", "姓名", "手机号", "日期", "省份", "城市", "区县", "地址", "状态", "错误信息"}
	if err := sw.SetRow("A1", headers); err != nil {
		return err
	}

	// 应用导出过滤器
	query := s.DB.Model(&model.Record{}).Where("batch_id = ?", batchID)
	switch filter {
	case "clean":
		query = query.Where("status = ?", "Clean")
	case "error":
		query = query.Where("status != ?", "Clean")
	}

	rows, err := query.Order("row_index asc").Rows()
	if err != nil {
		return err
	}
	defer rows.Close()

	currentRow := 2
	for rows.Next() {
		var r model.Record
		s.DB.ScanRows(rows, &r)

		// 构建 Excel 行数据
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

		// Excel 行数限制检查 (最大 1,048,576 行)
		if currentRow > 1048576 {
			log.Println("警告: 已达到 Excel 行数限制，数据将被截断")
			break
		}
	}

	if err := sw.Flush(); err != nil {
		return err
	}

	// 写入到输出流
	_, err = f.WriteTo(w)
	return err
}
