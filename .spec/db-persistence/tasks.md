# 数据库持久化任务清单

## 任务概览

| 阶段 | 任务数 | 预估工时 | 说明 |
|-----|--------|----------|------|
| **Phase 1: 基础设施** | 4 | 2h | 数据库连接、ORM 配置、迁移工具 |
| **Phase 2: 数据模型** | 4 | 3h | 表结构定义、Repository 层 |
| **Phase 3: 核心集成** | 4 | 4h | Memory 适配、Chat API 改造 |
| **Phase 4: 扩展功能** | 4 | 3h | 消息编辑、Artifact 版本、数据集 |
| **Phase 5: 测试与文档** | 2 | 2h | 单元测试、API 文档 |

**总预估**: 14h

---

## Phase 1: 基础设施

### TASK-DB-001: 添加数据库依赖

**目标**: 安装 SQLAlchemy、asyncpg、Alembic 等依赖。

- [x] 更新 `pyproject.toml` 添加依赖
- [x] 运行 `uv sync` 同步环境
- [x] **验证**: `uv run python -c "import sqlalchemy; print(sqlalchemy.__version__)"` 输出 2.0+

### TASK-DB-002: 创建 Docker Compose 配置

**目标**: 本地 PostgreSQL 开发环境。

- [x] 创建 `docker-compose.yml`
- [x] 创建 `.env.example` 模板
- [x] **验证**: `docker-compose up -d` 启动成功，`psql` 可连接

### TASK-DB-003: 实现数据库连接池

**目标**: 创建异步数据库连接管理。

- [x] 创建 `app/db/__init__.py`
- [x] 创建 `app/db/database.py` (AsyncEngine, AsyncSession)
- [x] 更新 `app/config.py` 添加数据库配置项
- [x] 在 `app/main.py` lifespan 中初始化连接池
- [x] **验证**: 应用启动时日志显示数据库连接成功

### TASK-DB-004: 初始化 Alembic

**目标**: 配置数据库迁移工具。

- [x] 运行 `uv run alembic init alembic`
- [x] 配置 `alembic/env.py` 使用 async 模式
- [x] 配置 `alembic.ini` 读取 DATABASE_URL
- [x] **验证**: `uv run alembic current` 无报错

---

## Phase 2: 数据模型

### TASK-DB-005: 定义 SQLAlchemy 模型

**目标**: 创建 sessions, messages, artifacts, datasets 模型。

- [x] 创建 `app/db/models.py`
- [x] 定义 `Session` 模型
- [x] 定义 `Message` 模型（含软删除、编辑字段）
- [x] 定义 `Artifact` 模型（含版本控制）
- [x] 定义 `Dataset` 模型（JSONB 字段）
- [x] **验证**: `uv run python -c "from app.db.models import *"` 无报错

### TASK-DB-006: 生成初始迁移

**目标**: 创建数据库表。

- [x] 运行 `uv run alembic revision --autogenerate -m "initial_schema"`
- [x] 审核生成的迁移脚本
- [x] 运行 `uv run alembic upgrade head`
- [x] **验证**: 数据库中存在 4 张表，结构正确

### TASK-DB-007: 实现 Session Repository

**目标**: 会话数据访问层。

- [x] 创建 `app/db/repositories/session_repo.py`
- [x] 实现 `create`, `get_by_id`, `list_all`, `soft_delete` 方法
- [x] **验证**: 功能测试通过（单元测试待补充）

### TASK-DB-008: 实现 Message Repository

**目标**: 消息数据访问层。

- [x] 创建 `app/db/repositories/message_repo.py`
- [x] 实现 `create`, `get_by_session`, `update` (编辑), `soft_delete` 方法
- [x] **验证**: 功能测试通过（单元测试待补充）

---

## Phase 3: 核心集成

### TASK-DB-009: 重构 Memory 模块

**目标**: 让 `app/core/memory.py` 支持数据库后端。

- [x] 创建 `DatabaseStore` 类实现相同接口
- [x] 通过配置项切换 `InMemoryStore` / `DatabaseStore`
- [x] 保持 `get_memory()` 接口不变
- [x] **验证**: 现有 API 无需修改，功能正常

### TASK-DB-010: Chat API Artifact 解析与存储

**目标**: 在保存消息时解析 Artifact 并单独存储。

- [x] 更新 `app/api/chat.py` 的 `save_to_memory` 函数
- [x] 解析 `full_response` 中的 `<artifact>` 标签
- [x] 将 Artifact 元数据和代码存入 `artifacts` 表
- [x] 消息 content 保留引用，不含完整代码
- [x] **验证**: 生成组件后，artifacts 表有记录

### TASK-DB-011: Sessions API 适配

**目标**: 让会话管理 API 使用数据库。

- [x] 更新 `app/api/sessions.py` 使用 Repository
- [x] 实现软删除逻辑
- [x] **验证**: GET/DELETE 接口功能正常

### TASK-DB-012: 实现消息分页 API

**目标**: 新增消息列表分页接口。

- [x] 添加 `GET /api/sessions/{id}/messages` 接口
- [x] 支持 `limit`, `offset` 参数（`before` 待实现）
- [x] **验证**: 分页功能正常

---

## Phase 4: 扩展功能

### TASK-DB-013: 实现消息编辑 API

**目标**: 支持用户编辑已发送消息。

- [x] 添加 `PATCH /api/sessions/{id}/messages/{msg_id}` 接口
- [x] 编辑时保存 `original_content` 和 `edited_at`
- [x] **验证**: 编辑后原始内容可追溯

### TASK-DB-014: 实现 Artifact 版本管理

**目标**: 同一 identifier 的多次迭代。

- [x] 创建 Artifact 时检查 identifier 是否存在
- [x] 存在则 version + 1
- [x] 添加 `GET /api/artifacts/{identifier}/versions` 接口
- [x] **验证**: 多次生成同名组件后版本号递增（待功能测试）

### TASK-DB-015: 实现 Artifact Repository

**目标**: Artifact 数据访问层。

- [x] 创建 `app/db/repositories/artifact_repo.py`
- [x] 实现版本查询、最新版本获取
- [x] **验证**: 功能测试通过（单元测试待补充）

### TASK-DB-016: 数据集上传 API

**目标**: 支持用户上传 JSON/CSV 数据。

- [x] 添加 `POST /api/datasets` 接口（multipart/form-data）
- [x] 解析 CSV 转为 JSON 存入 JSONB
- [x] 添加 `GET/DELETE /api/datasets/{id}` 接口
- [x] **验证**: 待功能测试

---

## Phase 5: 测试与文档

### TASK-DB-017: 单元测试

**目标**: 核心功能测试覆盖。

- [x] 创建 `tests/db/` 目录
- [x] Artifact Parser/Injection 逻辑测试 (`tests/core/test_artifact_logic.py`)
- [x] Timezone Logic 验证 (通过脚本验证)
- [ ] Repository 层单元测试 (需 Mock DB)
- [ ] API 集成测试
- [ ] **验证**: `uv run pytest` 全部通过

### TASK-DB-018: 更新 API 文档与健壮性

**目标**: Swagger 文档完整，API 错误处理完善。

- [x] 添加 UUID 格式强校验 (返回 400 而非 500)
- [x] 修正数据库时区问题 (UTC Naive -> UTC Aware)
- [ ] 更新 Pydantic 响应模型
- [ ] 添加接口描述和示例
- [ ] **验证**: `/docs` 页面接口完整、可交互

---

## 快速开始命令

```bash
# 启动数据库
docker-compose up -d

# 运行迁移
uv run alembic upgrade head

# 启动服务
uv run dev

# 运行测试
uv run pytest tests/db/
```
