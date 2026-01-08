package service

import (
	"archive/zip"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"
)

type ProcessStats struct {
	TotalRows   int        `json:"total_rows"`
	SuccessRows int        `json:"success_rows"`
	FailedRows  int        `json:"failed_rows"`
	ResultID    string     `json:"result_id"`
	PreviewData []UserData `json:"preview_data"`
}

type Processor struct {
	cleaner *CleanerService
	storage map[string]string // ID -> ZipFilePath
}

var GlobalProcessor *Processor

func InitProcessor() {
	GlobalProcessor = &Processor{
		cleaner: NewCleanerService(),
		storage: make(map[string]string),
	}
}

func (p *Processor) GetResultPath(id string) (string, bool) {
	path, ok := p.storage[id]
	return path, ok
}

func (p *Processor) ProcessFile(inputPath string) (*ProcessStats, error) {
	// 1. Detect Type and Read
	ext := strings.ToLower(filepath.Ext(inputPath))
	var rows [][]string
	var err error

	if ext == ".xlsx" {
		rows, err = readExcel(inputPath)
	} else if ext == ".csv" {
		rows, err = readCSV(inputPath)
	} else {
		return nil, fmt.Errorf("unsupported file type: %s", ext)
	}

	if err != nil {
		return nil, err
	}

	// 2. Process
	cleanRows := [][]string{{"姓名", "手机号", "地址", "入职日期", "省", "市", "区"}}
	errorRows := [][]string{{"原始数据", "错误原因"}}

	stats := &ProcessStats{TotalRows: len(rows)}

	// Determine indices
	indices := ColIndices{
		Name:    -1, // Initialize with -1 to indicate not found
		Phone:   -1,
		Address: -1,
		Date:    -1,
	}

	startIndex := 0
	if len(rows) > 0 {
		header := rows[0]
		// Create a map for lower-case header checking
		headerMap := make(map[string]int)
		for i, col := range header {
			headerMap[strings.ToLower(strings.TrimSpace(col))] = i
		}

		// Helper to find any match
		findCol := func(keywords ...string) int {
			for _, k := range keywords {
				if idx, ok := headerMap[k]; ok {
					return idx
				}
				// Partial match check?
				for h, idx := range headerMap {
					if strings.Contains(h, k) {
						return idx
					}
				}
			}
			return -1
		}

		// Look for standard headers
		n := findCol("name", "姓名")
		p := findCol("phone", "手机", "电话", "mobile")
		a := findCol("address", "地址", "addr")
		d := findCol("date", "日期", "join", "入职")

		// If we found at least Phone or Name/Address, assume we found the header
		if p != -1 || (n != -1 && a != -1) {
			startIndex = 1
			// Update indices if found, otherwise keep default (or -1)
			if n != -1 {
				indices.Name = n
			}
			if p != -1 {
				indices.Phone = p
			}
			if a != -1 {
				indices.Address = a
			}
			if d != -1 {
				indices.Date = d
			}
		}
	}

	for i := startIndex; i < len(rows); i++ {
		// Detect repeated header lines (like in the user's test data)
		// If a row looks exactly like the header, skip it or mark error
		if i > 0 && len(rows) > 0 && len(rows[i]) > 0 && len(rows[0]) > 0 && indices.Phone != -1 && indices.Phone < len(rows[i]) && indices.Phone < len(rows[0]) {
			// Heuristic: if the phone column contains "phone" again
			isHeader := false
			if strings.Contains(strings.ToLower(rows[i][indices.Phone]), "phone") || strings.Contains(rows[i][indices.Phone], "手机") {
				isHeader = true
			}
			if isHeader {
				continue
			}
		}

		res := p.cleaner.ProcessRow(rows[i], indices)

		// Always append to preview data for the UI table
		stats.PreviewData = append(stats.PreviewData, res)

		if res.Status == "Clean" {
			stats.SuccessRows++
			cleanRows = append(cleanRows, []string{
				res.Name, res.Phone, res.Address, res.JoinDate,
				res.Province, res.City, res.District,
			})
		} else {
			stats.FailedRows++
			// Join original row for report
			orig := strings.Join(res.OriginalRow, " | ")
			errorRows = append(errorRows, []string{orig, res.Status})
		}
	}

	// 3. Write Output
	id := uuid.New().String()
	outputDir := filepath.Join("temp", id)
	os.MkdirAll(outputDir, 0755)

	cleanPath := filepath.Join(outputDir, "cleaned_data.xlsx")
	errPath := filepath.Join(outputDir, "error_report.xlsx")

	if err := writeExcel(cleanPath, "Cleaned", cleanRows); err != nil {
		return nil, err
	}
	if err := writeExcel(errPath, "Errors", errorRows); err != nil {
		return nil, err
	}

	// 4. Zip
	zipPath := filepath.Join("temp", id+".zip")
	if err := zipFiles(zipPath, []string{cleanPath, errPath}); err != nil {
		return nil, err
	}

	// Store
	p.storage[id] = zipPath
	stats.ResultID = id

	return stats, nil
}

// Helpers
func readExcel(path string) ([][]string, error) {
	f, err := excelize.OpenFile(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	// Get first sheet
	sheet := f.GetSheetName(0)
	if sheet == "" {
		return nil, fmt.Errorf("no sheet found")
	}
	return f.GetRows(sheet)
}

func readCSV(path string) ([][]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	r := csv.NewReader(f)
	r.FieldsPerRecord = -1 // Allow variable number of fields
	r.LazyQuotes = true    // Allow non-strict quoting
	return r.ReadAll()
}

func writeExcel(path, sheetName string, rows [][]string) error {
	f := excelize.NewFile()
	index, _ := f.NewSheet(sheetName)
	f.SetActiveSheet(index)
	f.DeleteSheet("Sheet1") // Remove default

	for i, row := range rows {
		axis, _ := excelize.CoordinatesToCellName(1, i+1)
		f.SetSheetRow(sheetName, axis, &row)
	}
	return f.SaveAs(path)
}

func zipFiles(zipName string, files []string) error {
	newZipFile, err := os.Create(zipName)
	if err != nil {
		return err
	}
	defer newZipFile.Close()

	zipWriter := zip.NewWriter(newZipFile)
	defer zipWriter.Close()

	for _, file := range files {
		if err := addFileToZip(zipWriter, file); err != nil {
			return err
		}
	}
	return nil
}

func addFileToZip(zipWriter *zip.Writer, filename string) error {
	fileToZip, err := os.Open(filename)
	if err != nil {
		return err
	}
	defer fileToZip.Close()

	info, err := fileToZip.Stat()
	if err != nil {
		return err
	}

	header, err := zip.FileInfoHeader(info)
	if err != nil {
		return err
	}
	header.Name = filepath.Base(filename)
	header.Method = zip.Deflate

	writer, err := zipWriter.CreateHeader(header)
	if err != nil {
		return err
	}
	_, err = io.Copy(writer, fileToZip)
	return err
}
