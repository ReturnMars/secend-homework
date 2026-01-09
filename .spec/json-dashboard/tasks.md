# JSON 数据驱动看板生成 - 任务清单

## 任务概览

| 阶段 | 任务数 | 状态 | 说明 |
|-----|--------|------|------|
| **Phase 1: Schema 分析** | 3 | ✅ 完成 | 实现数据结构分析和存储 |
| **Phase 2: Prompt 增强** | 3 | ✅ 完成 | 构建数据感知的 Prompt |
| **Phase 3: API 扩展** | 1 | ✅ 完成 | 新增数据获取 API |
| **Phase 4: 集成测试** | 2 | ✅ 完成 | 端到端验证 |

---

## Phase 1: Schema 分析

### TASK-DS-001: Schema 分析器核心实现 ✅
**目标**: 实现 Level 3 统计 Schema 提取

**文件**: `app/core/schema_analyzer.py`

- [x] 实现 `FieldStats` 和 `DatasetSchema` Pydantic 模型
- [x] 实现 `analyze_json_schema()` 函数
  - [x] 字段类型推断（string/number/boolean/date/null/mixed）
  - [x] 数值统计（min/max/avg）
  - [x] 字符串统计（unique_count, categories）
  - [x] 日期范围检测
  - [x] 采样行提取（前 5 行）
- [x] 处理嵌套 JSON（展平或标记为 object/array）
- [ ] 性能优化：大文件流式处理（可选优化）

**验收标准**: ✅ 32 个测试通过
```bash
uv run pytest tests/core/test_schema_analyzer.py -v
```

---

### TASK-DS-002: 数据库 Schema 存储 ✅
**目标**: 扩展 Dataset 模型以存储 Schema

**文件**: `app/db/models.py`, `alembic/versions/442e68c1b941_add_schema_info_to_datasets.py`

- [x] 在 `Dataset` 模型添加 `schema_info: JSONB` 字段
- [x] 创建 Alembic 迁移脚本
- [x] 运行迁移验证

**验收标准**: ✅
```bash
uv run alembic upgrade head  # 无错误
```

---

### TASK-DS-003: 上传 API 增强（Schema + Session 自动创建） ✅
**目标**: 上传时自动分析 Schema，并支持 session_id 可选

**文件**: `app/api/datasets.py`

- [x] `session_id` 改为可选参数
- [x] 如果未传 `session_id`，自动创建新 session 并返回
- [x] 上传成功后调用 `analyze_json_schema()`
- [x] 将 Schema 存入 `dataset.schema_info`
- [x] 响应中返回 `session_id`、`schema`、`data_mode`（inline/fetch）
- [x] 错误处理：分析失败不阻塞上传

---

## Phase 2: Prompt 增强

### TASK-DS-004: 数据上下文 Prompt 模板 ✅
**目标**: 创建数据感知 Prompt 模板

**文件**: `app/prompts/data_aware.py`

- [x] 实现 `DATA_CONTEXT_TEMPLATE`
- [x] 实现 `FETCH_INSTRUCTION` / `INLINE_INSTRUCTION`
- [x] Schema 格式化为人类可读描述
- [x] 控制 token 预算（~2000 tokens）

**验收标准**: ✅ 16 个测试通过
```bash
uv run pytest tests/core/test_data_aware_prompt.py -v
```

---

### TASK-DS-005: Prompt 构建器实现 ✅
**目标**: 自动组装数据感知 Prompt

**文件**: `app/core/prompt_builder.py`

- [x] 实现 `DataAwarePromptBuilder` 类
- [x] 查询 session 关联的 datasets
- [x] 根据 size_bytes 决定 data_mode
- [x] 组合数据上下文与用户消息

---

### TASK-DS-006: System Prompt 更新 ✅
**目标**: 允许数据获取场景使用 fetch

**文件**: `app/prompts/system.py`

- [x] 添加"大数据模式"规则
- [x] 明确 fetch + useEffect 的使用条件
- [x] 添加 loading 状态处理要求

**验收标准**: 代码审查确认规则清晰 ✅

---

## Phase 3: API 扩展

### TASK-DS-007: 数据获取 API ✅
**目标**: 新增供 Sandpack fetch 调用的 API

**文件**: `app/api/datasets.py`

- [x] 实现 `GET /api/datasets/{dataset_id}/data`
- [x] 返回格式：`{rows: [...], row_count: N}`
- [ ] 验证请求来源（可选：session 归属检查）

---

## Phase 4: 集成测试

### TASK-DS-009: Chat 集成数据上下文 ✅
**目标**: Chat API 自动注入数据上下文，支持显式指定 dataset

**文件**: `app/api/chat.py`, `app/models/chat.py`

- [x] `ChatRequest` 新增可选字段 `dataset_id: str | None`
- [x] 实现 `resolve_dataset()` 数据集解析逻辑：
  - 优先级 1：显式指定的 `dataset_id`（跨 session 复用）
  - 优先级 2：session 关联的最新 dataset（自动关联）
  - 优先级 3：无数据集，普通对话模式
- [x] 调用 `DataAwarePromptBuilder` 增强消息
- [x] 确保流式响应正常

---

### TASK-DS-010: 端到端测试 ✅
**目标**: 验证完整后端流程

**文件**: `tests/api/test_json_dashboard.py`

- [x] 测试 Schema 分析准确性（各种数据类型）
- [x] 测试小数据（< 10KB）返回 data_mode: inline
- [x] 测试大数据（≥ 10KB）返回 data_mode: fetch
- [x] 测试数据 API 返回正确格式
- [ ] 测试 Chat API 自动注入数据上下文（需要完整集成测试环境）

**验收标准**: ✅ 55 个测试通过
```bash
uv run pytest tests/ -k "schema or data_aware or json_dashboard" -v
```

---

## 快速命令

```bash
# 运行 Schema 分析器测试
uv run pytest tests/core/test_schema_analyzer.py -v

# 运行 Prompt 模板测试
uv run pytest tests/core/test_data_aware_prompt.py -v

# 运行 API 集成测试
uv run pytest tests/api/test_json_dashboard.py -v

# 运行所有相关测试
uv run pytest tests/ -k "schema or data_aware or json_dashboard" -v

# 运行数据库迁移
uv run alembic upgrade head

# 启动开发服务器
uv run uvicorn app.main:app --reload --port 8000
```

---

## 实现总结

### 新增文件
- `app/core/schema_analyzer.py` - Level 3 统计 Schema 提取
- `app/core/prompt_builder.py` - 数据感知 Prompt 构建器
- `app/prompts/data_aware.py` - 数据上下文 Prompt 模板
- `alembic/versions/442e68c1b941_add_schema_info_to_datasets.py` - 数据库迁移
- `tests/core/test_schema_analyzer.py` - Schema 分析器测试
- `tests/core/test_data_aware_prompt.py` - Prompt 模板测试
- `tests/api/test_json_dashboard.py` - API 集成测试

### 修改文件
- `app/db/models.py` - 添加 `schema_info` 字段
- `app/db/repositories/dataset_repo.py` - 支持 schema_info 参数
- `app/api/datasets.py` - 增强上传 API，新增数据获取端点
- `app/api/chat.py` - 集成数据上下文
- `app/models/chat.py` - 添加 `dataset_id` 字段
- `app/prompts/system.py` - 添加大数据模式规则
- `app/config.py` - 添加 `API_BASE_URL` 配置
