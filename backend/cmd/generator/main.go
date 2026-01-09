package main

import (
	"bufio"
	"encoding/csv"
	"flag"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var (
	rows      = flag.Int("n", 10000, "number of rows to generate")
	out       = flag.String("o", "uploads/large_data.csv", "output filename")
	dirtyRate = flag.Float64("rate", 0.3678, "dirty data rate (0.0 - 1.0), default ~36.8%")
)

func main() {
	flag.Parse()

	rate := *dirtyRate
	if rate < 0 {
		rate = 0
	}
	if rate > 1 {
		rate = 1
	}

	// Ensure output directory exists
	dir := filepath.Dir(*out)
	if dir != "." {
		if err := os.MkdirAll(dir, 0755); err != nil {
			fmt.Printf("Failed to create directory %s: %v\n", dir, err)
			os.Exit(1)
		}
	}

	fmt.Printf("Generating %d rows to %s (dirty_rate=%.2f%%)...\n", *rows, *out, rate*100)

	f, err := os.Create(*out)
	if err != nil {
		panic(err)
	}
	defer f.Close()

	// UTF-8 BOM
	f.Write([]byte("\xEF\xBB\xBF"))

	w := bufio.NewWriter(f)
	cw := csv.NewWriter(w)

	// Header matched to test_data.csv: id,name,phone,join_date,address,department
	cw.Write([]string{"id", "name", "phone", "join_date", "address", "department"})

	lastNames := []string{"赵", "钱", "孙", "李", "周", "吴", "郑", "王", "冯", "陈", "褚", "卫", "蒋", "沈", "韩", "杨"}
	firstNames := []string{"伟", "芳", "娜", "敏", "静", "秀英", "丽", "强", "磊", "军", "洋", "勇", "艳", "杰", "娟", "涛", "明", "超"}
	departments := []string{"研发部", "市场部", "销售部", "人事部", "财务部", "IT部", "运营部", "法务部", "后勤部"}
	provinces := []string{"北京市", "上海市", "广东省", "浙江省", "江苏省", "四川省", "湖北省"}
	cities := []string{"市辖区", "杭州市", "南京市", "成都市", "武汉市", "深圳市", "广州市"}

	// Dirty Patterns
	dirtyStrings := []string{
		"NULL", "undefined", "N/A", "", "   ", // Empties
		"Robert'); DROP TABLE students;--", // SQL Injection
		"User_Import_Error_#123",           // System error lookalike
		"😊😂🤣❤️😍",                           // Emojis
		"Multi\nLine\nString",              // Multiline
		"String_With_\"Quotes\"",           // Quotes
		strings.Repeat("LongString", 20),   // Too long
	}

	rng := rand.New(rand.NewSource(time.Now().UnixNano()))

	for i := 1; i <= *rows; i++ {
		isDirty := rng.Float64() < rate

		// Name
		name := lastNames[rng.Intn(len(lastNames))] + firstNames[rng.Intn(len(firstNames))]

		// Phone
		prefix := 13 + rng.Intn(7)
		phone := fmt.Sprintf("%d%09d", prefix, rng.Intn(1000000000))

		// Date
		year := 2020 + rng.Intn(5)
		month := 1 + rng.Intn(12)
		day := 1 + rng.Intn(28)
		date := fmt.Sprintf("%04d-%02d-%02d", year, month, day)

		// Address
		addr := provinces[rng.Intn(len(provinces))] + cities[rng.Intn(len(cities))] + fmt.Sprintf("街道%d号", rng.Intn(1000))

		// Dept
		dept := departments[rng.Intn(len(departments))]

		// Inject Dirt
		if isDirty {
			fieldToCorrupt := rng.Intn(5) // Don't corrupt ID usually, corrupt others

			// Select standard dirt or specific field corruption
			dirtType := rng.Intn(10)

			if dirtType < 6 {
				// Use pre-defined dirty strings
				dirt := dirtyStrings[rng.Intn(len(dirtyStrings))]
				switch fieldToCorrupt {
				case 0:
					name = dirt
				case 1:
					phone = dirt
				case 2:
					date = dirt
				case 3:
					addr = dirt
				case 4:
					dept = dirt
				}
			} else {
				// Specific logic corruption
				switch fieldToCorrupt {
				case 0:
					name = "" // Missing Name
				case 1:
					// Corrupt Phone specifically
					formats := []string{"123", "phone#123", "138-0000-0000", "+86 138", "not a number"}
					phone = formats[rng.Intn(len(formats))]
				case 2:
					// Corrupt Date specifically
					dates := []string{"2023/13/01", "tomorrow", "TBD", "2023-02-30", "1990.01.01", "21-Nov-23"}
					date = dates[rng.Intn(len(dates))]
				case 3:
					addr = strings.Repeat("A", 300) // Oversized addr
				case 4:
					dept = "Unknown_Dept"
				}
			}
		}

		cw.Write([]string{
			fmt.Sprintf("%d", i),
			name,
			phone,
			date,
			addr,
			dept,
		})

		if i%1000 == 0 {
			cw.Flush()
		}
	}
	cw.Flush()
	w.Flush()

	fmt.Printf("Done! Generated %d rows.\n", *rows)
}
