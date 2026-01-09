# JSON Dashboard 技术栈调查

> 基于 Context7 文档查询整理，更新日期：2026-01-06

---

## 1. Pydantic v2 - Schema 分析器数据模型

**来源**: `/websites/pydantic_dev` (Benchmark Score: 94.4)

### 1.1 关键用法

#### 可选字段与联合类型

```python
from pydantic import BaseModel

# Python 3.10+ 语法（推荐）
class FieldStats(BaseModel):
    type: str
    nullable: bool = False
    
    # 可选字段：使用 | None 语法
    unique_count: int | None = None
    sample_values: list[str] | None = None
    min: float | None = None
    max: float | None = None
    avg: float | None = None
    categories: list[str] | None = None
```

#### 嵌套模型

```python
from pydantic import BaseModel

class FieldStats(BaseModel):
    type: str
    min: float | None = None
    max: float | None = None

class DatasetSchema(BaseModel):
    fields: dict[str, FieldStats]  # 嵌套模型作为字典值
    row_count: int
    size_bytes: int
    sample_rows: list[dict]  # 采样数据
```

#### 序列化

```python
schema = DatasetSchema(...)
schema.model_dump()  # 转为 dict（v2 新方法）
schema.model_dump_json()  # 转为 JSON 字符串
```

### 1.2 注意事项

- Pydantic v2 使用 `model_dump()` 替代 v1 的 `.dict()`
- 使用 `| None` 语法比 `Optional[T]` 更简洁
- `list[str]` 会自动将可迭代对象转为列表

---

## 2. SQLAlchemy 2.0 - JSONB 字段

**来源**: `/websites/sqlalchemy_en_20` (Benchmark Score: 88.7)

### 2.1 PostgreSQL JSONB 类型

```python
from sqlalchemy import Column, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class Dataset(Base):
    __tablename__ = "datasets"
    
    id: Mapped[int] = mapped_column(primary_key=True)
    
    # JSONB 字段定义
    schema_info: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="Level 3 统计 Schema"
    )
```

### 2.2 JSONB 特殊操作

```python
from sqlalchemy.dialects.postgresql import JSONB

# JSONB 支持的操作：
# - has_key() - 检查 key 是否存在
# - has_all() - 检查所有 keys 是否存在
# - has_any() - 检查任意 key 是否存在
# - contains() - 包含检查
# - contained_by() - 被包含检查
# - path_exists() - JSONPath 表达式匹配
```

### 2.3 注意事项

- **就地修改检测**：JSONB 默认不检测 ORM 中的就地修改
- 如需检测修改，需使用 `sqlalchemy.ext.mutable` 扩展
- 本项目场景：Schema 只在上传时写入一次，无需追踪修改

---

## 3. Alembic - 数据库迁移

**来源**: `/sqlalchemy/alembic` (Benchmark Score: 81.5)

### 3.1 添加 JSONB 列

```python
"""add schema_info column to datasets

Revision ID: xxx
Revises: yyy
Create Date: 2026-01-06

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# revision identifiers
revision = 'xxx'
down_revision = 'yyy'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'datasets',
        sa.Column('schema_info', JSONB, nullable=True, comment='Level 3 统计 Schema')
    )


def downgrade():
    op.drop_column('datasets', 'schema_info')
```

### 3.2 常用命令

```bash
# 创建迁移脚本
uv run alembic revision -m "add schema_info column"

# 自动生成迁移（检测模型变化）
uv run alembic revision --autogenerate -m "add schema_info column"

# 执行迁移
uv run alembic upgrade head

# 回滚上一个版本
uv run alembic downgrade -1

# 查看当前版本
uv run alembic current
```

---

## 4. FastAPI - 可选表单字段与文件上传

**来源**: `/websites/fastapi_tiangolo` (Benchmark Score: 94.6)

### 4.1 文件上传 + 可选表单字段

```python
from typing import Annotated
from fastapi import FastAPI, File, Form, UploadFile

app = FastAPI()

@router.post("")
async def upload_dataset(
    file: Annotated[UploadFile, File(description="JSON or CSV file")],
    session_id: Annotated[str | None, Form(description="Optional session ID")] = None,
    name: Annotated[str | None, Form(description="Dataset name")] = None,
):
    """
    可选表单字段：
    - 使用 `str | None` 类型
    - 设置默认值 `= None`
    """
    if session_id is None:
        session_id = str(uuid.uuid4())  # 自动生成
    
    # ... 处理逻辑
```

### 4.2 传统语法（兼容）

```python
from fastapi import File, Form, UploadFile
from typing import Optional

@router.post("")
async def upload_dataset(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(None),  # 可选
    name: Optional[str] = Form(None),  # 可选
):
    pass
```

### 4.3 注意事项

- **不能混用 Form 和 JSON Body**：使用 `File()` 或 `Form()` 时，请求体会是 `multipart/form-data`，不能同时接收 JSON body
- **Annotated 语法**：Python 3.9+ 推荐使用 `Annotated` 语法
- **可选参数**：设置 `= None` 作为默认值使参数变为可选

---

## 5. JSON 类型推断最佳实践

### 5.1 类型推断规则

```python
import re
from datetime import datetime

def infer_field_type(values: list) -> str:
    """
    推断字段类型
    
    优先级：
    1. null (所有值都是 None)
    2. boolean
    3. number (int/float)
    4. date (ISO 8601 格式)
    5. string
    6. object/array (嵌套结构)
    7. mixed (多种类型混合)
    """
    non_null_values = [v for v in values if v is not None]
    
    if not non_null_values:
        return "null"
    
    types = set()
    for v in non_null_values:
        if isinstance(v, bool):
            types.add("boolean")
        elif isinstance(v, (int, float)):
            types.add("number")
        elif isinstance(v, str):
            if is_date_string(v):
                types.add("date")
            else:
                types.add("string")
        elif isinstance(v, dict):
            types.add("object")
        elif isinstance(v, list):
            types.add("array")
    
    if len(types) == 1:
        return types.pop()
    return "mixed"

def is_date_string(s: str) -> bool:
    """检查是否为日期字符串（简化版）"""
    # ISO 8601: 2024-01-15, 2024-01-15T10:30:00
    date_patterns = [
        r'^\d{4}-\d{2}-\d{2}$',
        r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}',
        r'^\d{4}/\d{2}/\d{2}$',
    ]
    return any(re.match(p, s) for p in date_patterns)
```

### 5.2 统计计算

```python
from statistics import mean

def calculate_number_stats(values: list[float | int]) -> dict:
    """计算数值字段统计"""
    non_null = [v for v in values if v is not None and isinstance(v, (int, float))]
    if not non_null:
        return {}
    return {
        "min": min(non_null),
        "max": max(non_null),
        "avg": round(mean(non_null), 2),
    }

def calculate_string_stats(values: list[str], max_categories: int = 20) -> dict:
    """计算字符串字段统计"""
    non_null = [v for v in values if v is not None and isinstance(v, str)]
    if not non_null:
        return {}
    
    unique = set(non_null)
    result = {
        "unique_count": len(unique),
        "sample_values": list(unique)[:5],  # 最多 5 个样本
    }
    
    # 如果类别数较少，列出所有类别
    if len(unique) <= max_categories:
        result["categories"] = sorted(unique)
    
    return result
```

---

## 6. 依赖版本确认

```toml
# pyproject.toml

[project]
dependencies = [
    # Pydantic v2
    "pydantic>=2.0.0",
    "pydantic-settings>=2.0.0",
    
    # SQLAlchemy 2.0
    "sqlalchemy[asyncio]>=2.0.0",
    "asyncpg>=0.29.0",  # PostgreSQL async driver
    
    # Alembic
    "alembic>=1.13.0",
    
    # FastAPI
    "fastapi>=0.115.0",
    "python-multipart>=0.0.9",  # 文件上传必需
]
```

---

## 7. 关键实现注意事项

| 模块 | 注意点 |
|------|--------|
| **Pydantic** | 使用 `model_dump()` 而非 `.dict()`；使用 `\| None` 语法 |
| **SQLAlchemy** | JSONB 需从 `sqlalchemy.dialects.postgresql` 导入 |
| **Alembic** | 使用 `--autogenerate` 自动检测模型变化 |
| **FastAPI** | 可选 Form 字段需设置 `= None` 默认值；不能混用 Form 和 JSON Body |
| **类型推断** | 优先检测 boolean（因为 Python 中 `bool` 是 `int` 子类）|

