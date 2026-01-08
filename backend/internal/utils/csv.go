package utils

import (
	"encoding/csv"
	"fmt"
	"os"
	"strings"

	"github.com/xuri/excelize/v2"
)

// ColIndices holds the index for each mapped field
type ColIndices struct {
	Name    int
	Phone   int
	Address int
	Date    int
}

// ReadFile reads CSV or Excel and returns a slice of string slices
func ReadFile(path string) ([][]string, error) {
	ext := strings.ToLower(path[len(path)-5:]) // simple extension check
	if strings.HasSuffix(ext, ".xlsx") {
		return readExcel(path)
	}
	// Fallback to CSV
	return readCSV(path)
}

func readExcel(path string) ([][]string, error) {
	f, err := excelize.OpenFile(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
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
	r.FieldsPerRecord = -1
	r.LazyQuotes = true
	return r.ReadAll()
}

// DetectHeaders finds the indices of required columns
func DetectHeaders(header []string) ColIndices {
	indices := ColIndices{Name: -1, Phone: -1, Address: -1, Date: -1}

	headerMap := make(map[string]int)
	for i, col := range header {
		headerMap[strings.ToLower(strings.TrimSpace(col))] = i
	}

	findCol := func(keywords ...string) int {
		for _, k := range keywords {
			if idx, ok := headerMap[k]; ok {
				return idx
			}
			for h, idx := range headerMap {
				if strings.Contains(h, k) {
					return idx
				}
			}
		}
		return -1
	}

	indices.Name = findCol("name", "姓名")
	indices.Phone = findCol("phone", "手机", "电话", "mobile")
	indices.Address = findCol("address", "地址", "addr")
	indices.Date = findCol("date", "日期", "join", "入职")

	return indices
}
