# 后端需求规范

## 概述

本文档定义 Nexus AI Demo 后端服务的功能需求和技术约束。后端使用 Python + LangChain + FastAPI 构建，为已完成的 Next.js + Sandpack 前端提供 AI 对话能力。

---

## 1. 系统边界

### 1.1 前端已完成功能

| 功能 | 状态 | 说明 |
|-----|------|------|
| 聊天界面 | ✅ 完成 | 使用 Vercel AI SDK |
| Artifact 解析 | ✅ 完成 | 流式 XML 解析 |
| 代码预览 | ✅ 完成 | Sandpack 沙箱渲染 |
| UI 布局 | ✅ 完成 | 分屏设计 |

### 1.2 后端需提供功能

| 功能 | 优先级 | 说明 |
|-----|--------|------|
| 聊天 API | P0 | 核心流式对话接口 |
| 多模型支持 | P0 | OpenAI/Anthropic/Google |
| 会话管理 | P1 | 对话历史维护 |
| 设置接口 | P1 | API Key 配置 |

---

## 2. 功能需求

### 2.1 聊天 API（P0）

**需求 ID**: REQ-CHAT-001

**描述**: 提供 SSE 流式对话接口，与前端 Vercel AI SDK 兼容。

#### 验收标准

1. 系统 **必须** 提供 `POST /api/chat` 接口接收用户消息
2. 系统 **必须** 返回 SSE (Server-Sent Events) 格式的流式响应
3. 响应格式 **必须** 与 Vercel AI SDK Data Stream Protocol 兼容
4. 系统 **必须** 在每次请求中注入预定义的 System Prompt
5. 系统 **必须** 支持对话历史上下文（通过 session_id 关联）
6. 当 LLM 调用失败时，系统 **必须** 返回结构化错误信息

#### 请求格式

```typescript
interface ChatRequest {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  session_id?: string;       // 会话ID，用于历史管理
  provider?: string;         // LLM 提供商
  model?: string;            // 模型名称
  api_key?: string;          // 可选，前端传入的 API Key
}
```

#### 响应格式

遵循 Vercel AI SDK Data Stream Protocol：

```
0:"Hello"
0:" world"
0:"!"
e:{"finishReason":"stop","usage":{"promptTokens":10,"completionTokens":20}}
d:{"finishReason":"stop"}
```

---

### 2.2 多模型支持（P0）

**需求 ID**: REQ-MODEL-001

**描述**: 支持多个主流 LLM 提供商的切换。

#### 验收标准

1. 系统 **必须** 支持以下 LLM 提供商：
   - OpenAI (GPT-4o, GPT-4o-mini)
   - Anthropic (Claude Sonnet, Claude Haiku)
   - Google (Gemini Pro, Gemini Flash)
2. 系统 **必须** 支持通过请求参数动态切换提供商和模型
3. 系统 **必须** 支持两种 API Key 来源：
   - 服务端环境变量配置
   - 请求参数传入（前端用户提供）
4. 当请求未指定模型时，系统 **应当** 使用默认模型（OpenAI GPT-4o）

#### 模型配置

| 提供商 | 默认模型 | 可选模型 |
|-------|---------|---------|
| openai | gpt-4o | gpt-4o-mini, gpt-4-turbo |
| anthropic | claude-sonnet-4-20250514 | claude-3-5-haiku-latest |
| google | gemini-2.0-flash | gemini-1.5-pro |

---

### 2.3 会话管理（P1）

**需求 ID**: REQ-SESSION-001

**描述**: 管理用户对话会话和历史记录。

#### 验收标准

1. 系统 **必须** 提供 `GET /api/sessions` 接口列出当前会话
2. 系统 **必须** 提供 `GET /api/sessions/{session_id}` 接口获取会话详情
3. 系统 **必须** 提供 `DELETE /api/sessions/{session_id}` 接口删除会话
4. 系统 **必须** 自动维护每个会话的消息历史
5. 系统 **应当** 限制单个会话的历史消息数量（默认 50 条）
6. 系统 **应当** 在会话闲置后自动过期（默认 1 小时）

#### 会话数据结构

```typescript
interface Session {
  session_id: string;
  created_at: string;      // ISO 8601
  updated_at: string;      // ISO 8601
  message_count: number;
  provider?: string;
  model?: string;
}
```

---

### 2.4 设置接口（P1）

**需求 ID**: REQ-SETTINGS-001

**描述**: 提供运行时配置查询接口。

#### 验收标准

1. 系统 **必须** 提供 `GET /api/settings/models` 接口返回可用模型列表
2. 系统 **必须** 提供 `POST /api/settings/validate-key` 接口验证 API Key 有效性
3. 接口 **必须** 不暴露服务端 API Key 的实际值

#### 模型列表响应

```typescript
interface ModelsResponse {
  providers: Array<{
    id: string;           // "openai" | "anthropic" | "google"
    name: string;         // "OpenAI"
    models: Array<{
      id: string;         // "gpt-4o"
      name: string;       // "GPT-4o"
      description?: string;
    }>;
    configured: boolean;  // 服务端是否已配置 API Key
  }>;
  default_provider: string;
  default_model: string;
}
```

---

## 3. 非功能需求

### 3.1 性能

| 指标 | 要求 |
|-----|------|
| 首字节时间 (TTFB) | < 500ms |
| 并发连接数 | ≥ 100 |
| 单会话历史查询 | < 50ms |

### 3.2 安全

1. 系统 **必须** 支持 CORS 配置，限制允许的源
2. 系统 **必须** 不在日志中记录 API Key
3. 系统 **应当** 对请求进行速率限制（可选）

### 3.3 可观测性

1. 系统 **应当** 记录结构化日志
2. 系统 **应当** 提供健康检查端点 `GET /health`
3. 系统 **可选** 提供 Prometheus 指标端点

---

## 4. System Prompt 需求

### 4.1 核心约束

System Prompt **必须** 包含以下规则：

1. **输出格式**: 强制使用 `<artifact>` XML 标签包裹代码
2. **代码规范**: 
   - 必须使用 `export default function App()`
   - 禁止 ReactDOM.render、createRoot
   - 禁止网络请求（fetch、axios）
3. **样式规范**: 必须使用 Tailwind CSS
4. **依赖限制**: 只允许使用预装的依赖库

### 4.2 预装依赖白名单

```
lucide-react    - 图标库
recharts        - 图表库
framer-motion   - 动画库
clsx            - 条件类名
tailwind-merge  - 类合并
date-fns        - 日期处理
```

---

## 5. 接口总览

| 方法 | 路径 | 优先级 | 说明 |
|-----|------|--------|------|
| POST | /api/chat | P0 | 流式对话 |
| GET | /api/sessions | P1 | 列出会话 |
| GET | /api/sessions/{id} | P1 | 获取会话详情 |
| DELETE | /api/sessions/{id} | P1 | 删除会话 |
| GET | /api/settings/models | P1 | 获取可用模型 |
| POST | /api/settings/validate-key | P1 | 验证 API Key |
| GET | /health | P0 | 健康检查 |

---

## 6. 错误码定义

| 错误码 | HTTP 状态 | 说明 |
|-------|----------|------|
| INVALID_API_KEY | 401 | API Key 无效 |
| MISSING_API_KEY | 401 | 未提供 API Key |
| PROVIDER_NOT_SUPPORTED | 400 | 不支持的 LLM 提供商 |
| MODEL_NOT_FOUND | 400 | 模型不存在 |
| SESSION_NOT_FOUND | 404 | 会话不存在 |
| RATE_LIMIT_EXCEEDED | 429 | 请求过于频繁 |
| LLM_ERROR | 502 | LLM 服务调用失败 |
| INTERNAL_ERROR | 500 | 内部服务错误 |

#### 错误响应格式

```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}
```

