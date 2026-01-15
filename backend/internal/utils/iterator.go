package utils

import (
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/xuri/excelize/v2"
)

// RowIterator defines an interface for iterating over rows from CSV or Excel
type RowIterator interface {
	Next() bool
	Row() []string
	Err() error
	Close() error
}

func NewRowIterator(path string) (RowIterator, error) {
	if strings.HasSuffix(strings.ToLower(path), ".xlsx") {
		return newExcelIterator(path)
	}
	return newCSVIterator(path)
}

// --- CSV Iterator ---

type csvIterator struct {
	f       *os.File
	r       *csv.Reader
	currRow []string
	err     error
}

func newCSVIterator(path string) (*csvIterator, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	r := csv.NewReader(f)
	r.FieldsPerRecord = -1
	r.LazyQuotes = true

	// Check BOM
	// We can't easily check BOM without peeking.
	// But csv.Reader usually handles it if we don't care about the first few bytes being garbage in header.
	// Or we can verify.
	// Let's keep it simple. Standard csv lib doesn't strip BOM automatically.
	// We might need to handle BOM stripping if the first header has it.

	return &csvIterator{f: f, r: r}, nil
}

func (it *csvIterator) Next() bool {
	if it.err != nil {
		return false
	}
	it.currRow, it.err = it.r.Read()
	if it.err == io.EOF {
		return false
	}
	return it.err == nil
}

func (it *csvIterator) Row() []string {
	return it.currRow
}

func (it *csvIterator) Err() error {
	if it.err == io.EOF {
		return nil
	}
	return it.err
}

func (it *csvIterator) Close() error {
	return it.f.Close()
}

// --- Excel Iterator ---

type excelIterator struct {
	f    *excelize.File
	rows *excelize.Rows
	curr []string
	err  error
}

func newExcelIterator(path string) (*excelIterator, error) {
	f, err := excelize.OpenFile(path)
	if err != nil {
		return nil, err
	}
	// Get first sheet
	sheet := f.GetSheetName(0)
	if sheet == "" {
		f.Close()
		return nil, fmt.Errorf("no sheet found")
	}
	rows, err := f.Rows(sheet)
	if err != nil {
		f.Close()
		return nil, err
	}
	return &excelIterator{f: f, rows: rows}, nil
}

func (it *excelIterator) Next() bool {
	if !it.rows.Next() {
		return false
	}
	it.curr, it.err = it.rows.Columns()
	return it.err == nil
}

func (it *excelIterator) Row() []string {
	return it.curr
}

func (it *excelIterator) Err() error {
	return it.err
}

func (it *excelIterator) Close() error {
	var firstErr error
	if it.rows != nil {
		if err := it.rows.Close(); err != nil {
			firstErr = err
		}
	}
	if it.f != nil {
		if err := it.f.Close(); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}
