# 数据库持久化技术设计

## 1. 技术选型

| 组件 | 选型 | 版本 | 理由 |
|------|------|------|------|
| 数据库 | PostgreSQL | 15+ | 生产级、JSONB 支持、pgvector 兼容 |
| ORM | SQLAlchemy | 2.0+ | 行业标准、async 支持、LangChain 兼容 |
| 异步驱动 | asyncpg | 0.29+ | 高性能 PostgreSQL 异步驱动 |
| 迁移工具 | Alembic | 1.13+ | SQLAlchemy 官方迁移工具 |
| 本地环境 | Docker Compose | - | 开发环境一致性 |

---

## 2. 数据模型

### 2.1 ER 图

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│    sessions     │       │    messages     │       │    artifacts    │
├─────────────────┤       ├─────────────────┤       ├─────────────────┤
│ id (PK, UUID)   │◄──────│ session_id (FK) │       │ id (PK, UUID)   │
│ title           │       │ id (PK, UUID)   │◄──────│ message_id (FK) │
│ created_at      │       │ role            │       │ identifier      │
│ updated_at      │       │ content         │       │ title           │
│ deleted_at      │       │ created_at      │       │ type            │
└─────────────────┘       │ updated_at      │       │ code            │
        │                 │ deleted_at      │       │ version         │
        │                 │ edited_at       │       │ created_at      │
        │                 │ original_content│       │ deleted_at      │
        │                 └─────────────────┘       └─────────────────┘
        │
        ▼
┌─────────────────┐
│    datasets     │
├─────────────────┤
│ id (PK, UUID)   │
│ session_id (FK) │
│ name            │
│ type (json/csv) │
│ data (JSONB)    │
│ size_bytes      │
│ created_at      │
│ deleted_at      │
└─────────────────┘
```

### 2.2 表结构定义

#### sessions 表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK, DEFAULT uuid_generate_v4() | 会话唯一标识 |
| title | VARCHAR(255) | NULLABLE | 会话标题（可由 AI 自动生成） |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 最后更新时间 |
| deleted_at | TIMESTAMP | NULLABLE | 软删除标记 |

**索引**:
- `idx_sessions_deleted_at` ON (deleted_at) WHERE deleted_at IS NULL

#### messages 表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK, DEFAULT uuid_generate_v4() | 消息唯一标识 |
| session_id | UUID | FK → sessions.id, NOT NULL | 所属会话 |
| role | VARCHAR(20) | NOT NULL, CHECK IN ('user', 'assistant', 'system') | 角色 |
| content | TEXT | NOT NULL | 消息内容（不含 artifact 代码） |
| original_content | TEXT | NULLABLE | 编辑前的原始内容 |
| edited_at | TIMESTAMP | NULLABLE | 编辑时间 |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 更新时间 |
| deleted_at | TIMESTAMP | NULLABLE | 软删除标记 |

**索引**:
- `idx_messages_session_id` ON (session_id)
- `idx_messages_created_at` ON (session_id, created_at)

#### artifacts 表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK, DEFAULT uuid_generate_v4() | Artifact 唯一标识 |
| message_id | UUID | FK → messages.id, NOT NULL | 所属消息 |
| identifier | VARCHAR(100) | NOT NULL | 组件标识符 (kebab-case) |
| title | VARCHAR(255) | NOT NULL | 组件标题 |
| type | VARCHAR(50) | NOT NULL, DEFAULT 'react' | 组件类型 |
| code | TEXT | NOT NULL | 组件代码 |
| version | INTEGER | NOT NULL, DEFAULT 1 | 版本号 |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 创建时间 |
| deleted_at | TIMESTAMP | NULLABLE | 软删除标记 |

**索引**:
- `idx_artifacts_message_id` ON (message_id)
- `idx_artifacts_identifier` ON (identifier)
- `idx_artifacts_identifier_version` ON (identifier, version DESC)

#### datasets 表

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| id | UUID | PK, DEFAULT uuid_generate_v4() | 数据集唯一标识 |
| session_id | UUID | FK → sessions.id, NOT NULL | 所属会话 |
| name | VARCHAR(255) | NOT NULL | 数据集名称 |
| type | VARCHAR(20) | NOT NULL, CHECK IN ('json', 'csv') | 数据类型 |
| data | JSONB | NOT NULL | 数据内容 |
| size_bytes | INTEGER | NOT NULL | 数据大小（字节） |
| created_at | TIMESTAMP | NOT NULL, DEFAULT NOW() | 创建时间 |
| deleted_at | TIMESTAMP | NULLABLE | 软删除标记 |

**索引**:
- `idx_datasets_session_id` ON (session_id)

---

## 3. 项目结构变更

```
backend/
├── app/
│   ├── db/                      # 新增：数据库模块
│   │   ├── __init__.py
│   │   ├── database.py          # 数据库连接池
│   │   ├── models.py            # SQLAlchemy 模型
│   │   └── repositories/        # 数据访问层
│   │       ├── __init__.py
│   │       ├── session_repo.py
│   │       ├── message_repo.py
│   │       ├── artifact_repo.py
│   │       └── dataset_repo.py
│   ├── core/
│   │   └── memory.py            # 重构：适配数据库存储
│   ...
├── alembic/                     # 新增：数据库迁移
│   ├── versions/
│   ├── env.py
│   └── alembic.ini
├── docker-compose.yml           # 新增：本地开发环境
└── .env.example                 # 更新：数据库配置
```

---

## 4. 配置变更

### 4.1 环境变量 (.env)

```bash
# Database
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/nexus_ai
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20

# 开发环境
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=nexus_ai
```

### 4.2 Docker Compose

```yaml
version: '3.8'
services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      POSTGRES_DB: ${POSTGRES_DB:-nexus_ai}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

---

## 5. API 变更

### 5.1 现有接口兼容性

所有现有 API 保持向后兼容，仅存储层变更：

| 接口 | 变更 |
|------|------|
| POST /api/chat | 消息写入数据库，Artifact 解析后单独存储 |
| GET /api/sessions | 从数据库查询 |
| GET /api/sessions/{id} | 从数据库加载完整会话 |
| DELETE /api/sessions/{id} | 软删除 |

### 5.2 新增接口

| 接口 | 方法 | 说明 |
|------|------|------|
| /api/sessions/{id}/messages | GET | 分页获取消息列表 |
| /api/sessions/{id}/messages/{msg_id} | PATCH | 编辑消息 |
| /api/sessions/{id}/artifacts | GET | 获取会话所有 Artifact |
| /api/artifacts/{identifier} | GET | 按标识符获取最新 Artifact |
| /api/artifacts/{identifier}/versions | GET | 获取 Artifact 历史版本 |
| /api/datasets | POST | 上传数据集 |
| /api/datasets/{id} | GET/DELETE | 数据集管理 |

---

## 6. 迁移策略

1. **并行运行**: 初期同时支持内存和数据库存储，通过环境变量切换
2. **渐进迁移**: 先迁移新会话，旧会话保持内存模式
3. **回滚方案**: 数据库故障时自动降级到内存模式

---

## 7. 未来扩展点

### 7.1 pgvector 集成（预留）

```python
# 未来添加向量列
from pgvector.sqlalchemy import Vector

class ArtifactEmbedding(Base):
    artifact_id = Column(UUID, ForeignKey('artifacts.id'))
    embedding = Column(Vector(1536))  # OpenAI embedding dimension
```

### 7.2 用户认证扩展（预留）

```python
# sessions 表预留 user_id
class Session(Base):
    user_id = Column(UUID, ForeignKey('users.id'), nullable=True)
```
