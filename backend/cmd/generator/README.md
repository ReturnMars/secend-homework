# Test Data Generator (测试数据生成器)

这是一个用于生成大量 CSV 测试数据的 Go 脚本。它不仅能生成符合系统格式的标准数据，还能按指定比例注入各种类型的“脏数据”（Dirty Data），以测试系统的鲁棒性、作为压力测试的输入源。

## 快速开始

在 `backend` 目录下执行：

```bash
# 生成 1万行数据（默认）到 generated.csv
go run cmd/generator/main.go

# 生成 5万行数据，输出到 my_test.csv
go run cmd/generator/main.go -n 50000 -o my_test.csv
```

## 参数说明

| 参数    | 类型   | 默认值           | 说明                                           |
| :------ | :----- | :--------------- | :--------------------------------------------- |
| `-n`    | int    | `10000`          | 生成的总行数。                                 |
| `-o`    | string | `large_data.csv` | 输出的文件名（路径相对于运行目录）。           |
| `-rate` | float  | `0.3678`         | 脏数据生成的概率 (0.0 - 1.0)。默认约为 36.8%。 |

## 典型用法示例

### 1. 生成标准的“干净”数据（少量错误）

如果你只想做简单的功能测试，不想处理太多错误，可以将脏数据率设得很低：

```bash
go run cmd/generator/main.go -n 1000 -rate 0.01 -o clean_test.csv
```

### 2. 生成“地狱级”脏数据（默认模式）

用于测试 ETL 清洗逻辑、前端渲染稳定性和导出功能。包含 **1/e (约 37%)** 的脏数据：

```bash
go run cmd/generator/main.go -n 50000 -o dirty_test.csv
```

### 3. 生成百万级压力测试文件

用于测试系统的内存占用和流式处理能力：

```bash
go run cmd/generator/main.go -n 1000000 -o million_rows.csv
```

## 脏数据类型 (Dirty Data Patterns)

脚本会随机注入以下类型的错误数据，模拟真实世界中的糟糕输入：

1.  **空值/无效值**: `NULL`, `undefined`, `N/A`, 空字符串。
2.  **SQL 注入攻击**: 如 `Robert'); DROP TABLE students;--`，测试系统是否能安全处理。
3.  **特殊字符/Emoji**: 如 `😊😂🤣`，测试数据库和前端的字符集支持。
4.  **多行文本**: 包含换行符 `\n` 的字符串（CSV 标准允许，但容易导致解析器错误）。**注意：这会导致某些编辑器显示的行数多于实际记录数。**
5.  **超长文本**: 极长的字符串，测试 UI 溢出或缓冲区限制。
6.  **格式错误**:
    - **电话**: `138-0000-0000`, `not a number`, `+86 138...`
    - **日期**: `2023/13/45` (非法日期), `TBD` (非日期字符), `2023.09.01` (非标准格式)

## 文件结构

生成的文件包含 UTF-8 BOM 头，确保在 Excel 中打开时不乱码。
列结构为：`id, name, phone, join_date, address, department`
