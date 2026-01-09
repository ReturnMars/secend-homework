# Nexus AI Demo 后端规范

## 项目概述

本目录包含 Nexus AI Demo **后端服务**的完整规范文档。

前端（Next.js + Sandpack）已完成，后端使用 **Python + LangChain + FastAPI** 构建。

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                          浏览器                                  │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │              Next.js + Sandpack (已完成)                   │ │
│  │  Chat Panel ◀────── SSE Stream ──────▶ Code Preview       │ │
│  └────────────────────────┬──────────────────────────────────┘ │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Python 后端 (本规范)                           │
│                                                                  │
│   FastAPI ──▶ LangChain ──▶ OpenAI / Anthropic / Google        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 文档结构

```
.spec/
├── README.md             # 本文件
├── requirements.md       # 需求规范 (What)
├── design.md             # 技术设计 (How)
├── tasks.md              # 开发任务 (Action)
└── tech-stack-notes.md   # 技术栈笔记 (Reference)
```

| 文档 | 内容 | 受众 |
|-----|------|------|
| [requirements.md](./requirements.md) | 功能需求、接口定义、验收标准 | PM / Dev |
| [design.md](./design.md) | 架构设计、模块实现、代码示例 | Dev |
| [tasks.md](./tasks.md) | 任务拆解、依赖关系、工时估算 | Dev |
| [tech-stack-notes.md](./tech-stack-notes.md) | 技术栈最新 API 参考 | Dev |

## 技术栈

| 组件 | 技术 | 版本 |
|-----|------|------|
| Web 框架 | FastAPI | 0.115+ |
| LLM 框架 | LangChain | 0.3+ |
| AI SDK 兼容 | fastapi-ai-sdk | 0.2+ |
| 数据验证 | Pydantic | 2.0+ |
| 服务器 | Uvicorn | 0.30+ |

## 快速开始

```bash
# 1. 创建项目结构
mkdir -p backend/app/{api,core/llm,models,prompts,utils}
mkdir -p backend/tests

# 2. 安装依赖
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 设置 API Key

# 4. 启动服务
uv run uvicorn app.main:app --reload --port 8000 --host 0.0.0.0
```

## 核心接口

| 方法 | 路径 | 说明 |
|-----|------|------|
| POST | /api/chat | 流式对话（SSE） |
| GET | /api/sessions | 列出会话 |
| GET | /api/sessions/{id} | 获取会话 |
| DELETE | /api/sessions/{id} | 删除会话 |
| GET | /api/settings/models | 获取模型列表 |
| GET | /health | 健康检查 |

## 开发进度

- [ ] Phase 1: 基础框架 (4h)
- [ ] Phase 2: 核心功能 (8h)
- [ ] Phase 3: 扩展功能 (4h)

详见 [tasks.md](./tasks.md)
