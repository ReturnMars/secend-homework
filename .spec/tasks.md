# 开发任务清单

## 任务概览

| 阶段 | 任务数 | 说明 |
|-----|--------|------|
| **Phase 1: 架构基石 (Architecture Bedrock)** | 5 | 建立项目骨架、配置、日志、错误处理及基础 API 服务 |
| **Phase 2: 核心引擎 (Core Engine)** | 4 | 实现 LLM 客户端、流式处理、Session 存储 |
| **Phase 3: 业务编排 (Business Logic)** | 3 | 完善 Chat API、会话管理、配置 API |
| **Phase 4: 生产就绪 (Production Ready)** | 2 | 安全加固、最终集成测试 |

---

## Phase 1: 架构基石 (Architecture Bedrock)

### TASK-001: 环境与项目骨架初始化
**目标**: 建立干净、可重复的开发环境。
- [x] 创建项目目录结构 (`app/{api,core,models,utils}`, `tests`)
- [x] 配置 `pyproject.toml` (Ruff, Pytest 配置)
- [x] 创建 `requirements.txt` / `pyproject.toml` (uv)
- [x] 编写 `tests/conftest.py` 基础 fixture
- [x] **Verification**: `make install` 或 `pip install` 成功，`pytest` 运行无错误（即使无测试用例）。

### TASK-002: 核心配置与日志系统
**目标**: 统一应用的配置管理和可观测性基础。
- [x] 实现 `app/config.py` (Pydantic Settings)
- [x] 实现 `app/utils/logger.py` (Loguru 集成)
- [x] 编写配置加载测试 `tests/core/test_config.py`
- [x] **Verification**: 测试能否读取环境变量，日志能否正确输出格式化信息。

### TASK-003: 数据模型与异常体系
**目标**: 定义类型契约和错误处理标准。
- [x] 定义通用响应模型 `app/models/base.py`
- [x] 定义核心异常类 `app/utils/exceptions.py`
- [x] 定义 Pydantic 模型 (`models/chat.py`, `models/session.py`)
- [x] **Verification**: 单元测试验证模型校验逻辑。

### TASK-004: FastAPI 最小应用核心
**目标**: 启动一个带有标准中间件和错误处理的 Web 服务。
- [x] 创建 `app/main.py`
- [x] 配置 CORS、Request ID 中间件
- [x] 注册全局异常处理器
- [x] 实现 `/health` 接口
- [x] **Verification**: `uvicorn` 启动成功，`/health` 返回 200，异常请求返回标准 JSON 错误。

### TASK-005: 路由分发架构
**目标**: 建立模块化的路由管理机制。
- [x] 创建 `app/api/router.py`
- [x] 创建各模块路由存根 (`api/chat.py`, `api/sessions.py`)
- [x] 挂载路由到 `main.py`
- [x] **Verification**: Swagger UI (`/docs`) 能看到所有预定义端点。

---

## Phase 2: 核心引擎 (Core Engine)

### TASK-006: 抽象 LLM 适配层
**目标**: 解耦具体模型提供商，定义统一接口。
- [x] 定义 LLM 接口协议
- [x] 实现 `app/core/llm/providers.py`
- [x] 编写 Mock Client 用于测试
- [x] **Verification**: 单元测试验证 Provider 配置加载正确。

### TASK-007: LangChain 客户端集成
**目标**: 实现支持多模型的 LLM 客户端。
- [x] 实现 `app/core/llm/client.py`
- [x] 封装 System Prompt (`app/prompts/system.py`)
- [x] **Verification**: 集成测试能成功调用 OpenAI (或 Mock) 并获取响应。

### TASK-008: 流式响应核心
**目标**: 实现与 Vercel AI SDK 兼容的 SSE 流。
- [x] 实现 `app/core/stream.py`
- [x] 实现 `create_chat_stream` 生成器
- [x] **Verification**: 编写脚本模拟 SSE 消费，验证数据格式符合协议。

### TASK-009: 内存会话存储
**目标**: 实现简单的会话状态管理。
- [x] 实现 `app/core/memory.py` (InMemoryStore)
- [x] 实现 LRU 缓存策略或限制
- [x] **Verification**: 单元测试验证增删改查及并发安全性。

---

## Phase 3: 业务编排 (Business Logic)

### TASK-010: Chat API 完整实现
**目标**: 串联所有核心组件，提供对话服务。
- [x] 完善 `POST /api/chat`
- [x] 集成 Session 存储
- [x] 集成 流式响应
- [x] **Verification**: 端到端测试，模拟完整对话流程。

### TASK-011: 会话管理 API
**目标**: 提供会话历史的 CRUD。
- [x] 实现 `GET /api/sessions`
- [x] 实现 `GET /api/sessions/{id}`
- [x] 实现 `DELETE /api/sessions/{id}`
- [x] **Verification**: Postman 或 curl 测试所有管理接口。

### TASK-012: 系统设置 API
**目标**: 暴露允许前端配置的能力。
- [x] 实现模型查询接口
- [x] 实现 API Key 验证接口
- [x] **Verification**: 前端能获取到后端配置的模型列表。

---

## 快速开发命令

```bash
# 初始化环境
python -m venv venv
source venv/Scripts/activate  # Git Bash

# 安装依赖
pip install -r requirements.txt

# 运行测试
pytest

# 启动服务
uvicorn app.main:app --reload
```
