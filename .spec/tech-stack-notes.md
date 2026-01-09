# 技术栈最新信息汇总

本文档汇总从 Context7 获取的最新技术信息，用于指导后端开发。

**注意**: LangChain 已升级到 v1.0，有重要 API 变化！

---

## 1. LangChain v1.0（Python）

### 1.1 核心导入变化

```python
# LangChain v1.0 新导入路径
from langchain.agents import create_agent
from langchain.messages import AIMessage, HumanMessage
from langchain.tools import tool
from langchain.chat_models import init_chat_model
from langchain.embeddings import init_embeddings
```

### 1.2 init_chat_model

```python
from langchain.chat_models import init_chat_model

# 基本用法 - 支持 "provider:model" 格式
model = init_chat_model("openai:gpt-4o-mini")

# 或分开指定
model = init_chat_model(
    model="gpt-4o",
    model_provider="openai",
    temperature=0.7,
    max_tokens=4096,
)

# 禁用流式（某些模型需要）
model = init_chat_model(
    "anthropic:claude-sonnet-4-5",
    disable_streaming=True
)
```

### 1.3 create_agent（v1.0 新增）

```python
from langchain.agents import create_agent

agent = create_agent(
    model="claude-sonnet-4-5-20250929",
    tools=[search_web, analyze_data],
    system_prompt="You are a helpful assistant."
)

result = agent.invoke({
    "messages": [{"role": "user", "content": "Hello"}]
})
```

### 1.4 Unified Content Blocks（v1.0 新增）

```python
# 统一访问不同提供商的响应内容
for block in response.content_blocks:
    if block["type"] == "reasoning":
        print(f"Reasoning: {block['reasoning']}")
    elif block["type"] == "text":
        print(f"Text: {block['text']}")
    elif block["type"] == "tool_call":
        print(f"Tool: {block['name']}({block['args']})")
```

### 1.2 流式输出

**同步流式：**
```python
for chunk in model.stream("问题"):
    print(chunk.text, end="", flush=True)
```

**异步流式（推荐）：**
```python
async for chunk in model.astream(messages):
    if chunk.content:
        yield chunk.content
```

**异步事件流：**
```python
async for event in model.astream_events("Hello"):
    if event["event"] == "on_chat_model_stream":
        print(event['data']['chunk'].text)
```

### 1.3 消息格式

**字典格式（简单）：**
```python
messages = [
    {"role": "system", "content": "You are helpful."},
    {"role": "user", "content": "Hello"},
    {"role": "assistant", "content": "Hi there!"},
]
```

**消息对象（推荐）：**
```python
from langchain.messages import SystemMessage, HumanMessage, AIMessage

messages = [
    SystemMessage(content="You are helpful."),
    HumanMessage(content="Hello"),
    AIMessage(content="Hi there!"),
]
```

### 1.4 历史管理

```python
from langchain.messages import RemoveMessage
from langgraph.graph.message import REMOVE_ALL_MESSAGES

# 删除特定消息
def delete_old_messages(state):
    messages = state["messages"]
    if len(messages) > 10:
        return {"messages": [RemoveMessage(id=m.id) for m in messages[:5]]}

# 删除所有消息
def clear_all(state):
    return {"messages": [RemoveMessage(id=REMOVE_ALL_MESSAGES)]}
```

---

## 2. FastAPI

### 2.1 SSE 流式响应

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import asyncio

app = FastAPI()

async def generate_stream():
    for i in range(10):
        yield f"data: Item {i}\n\n"
        await asyncio.sleep(0.1)

@app.get("/stream")
async def stream():
    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream"
    )
```

### 2.2 关键配置

- `media_type="text/event-stream"` - SSE 必须
- 异步生成器 `async def` + `yield`
- 格式：`data: ...\n\n`


---

## 3. 前后端通信协议

### 3.1 Vercel AI SDK Data Stream Protocol

**事件格式：**
```
0:"文本内容"
0:" 继续"
e:{"finishReason":"stop"}
d:{"finishReason":"stop"}
```

| 前缀 | 含义 |
|-----|------|
| `0:` | 文本块 |
| `2:` | 数据事件 |
| `8:` | 消息注释 |
| `e:` | 完成事件（含元数据） |
| `d:` | 完成事件（简单） |

---

## 4. 最佳实践总结

### 4.1 LLM 调用

```python
from langchain.chat_models import init_chat_model
from langchain.messages import SystemMessage, HumanMessage

# 初始化（支持多提供商）
model = init_chat_model("openai:gpt-4o", temperature=0.7)

# 流式调用
async def stream_response(messages):
    async for chunk in model.astream(messages):
        if chunk.content:
            yield chunk.content
```

### 4.2 完整聊天端点

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from langchain.chat_models import init_chat_model
from langchain.messages import SystemMessage, HumanMessage

app = FastAPI()

SYSTEM_PROMPT = """你是 Nexus AI..."""

@app.post("/api/chat")
async def chat(request: ChatRequest):
    # 初始化及业务逻辑...
    
    return StreamingResponse(
        generate_stream(request.messages),
        media_type="text/event-stream"
    )
```

---

## 5. 依赖版本确认

```toml
# pyproject.toml (uv)

[project]
dependencies = [
    # LangChain v1.0
    "langchain>=1.0.0",
    "langchain-core>=1.0.0",
    "langchain-openai>=0.3.0",
    "langchain-anthropic>=0.3.0",
    "langchain-google-genai>=2.0.0",
    
    # FastAPI
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.30.0",
    
    # Pydantic
    "pydantic>=2.0.0",
    "pydantic-settings>=2.0.0",
]
```


---

## 7. 关键注意事项

1. **LangChain init_chat_model**
   - 支持 `"provider:model"` 简写格式
   - 统一了不同提供商的接口
   - 使用 `astream()` 进行异步流式

2. **fastapi-ai-sdk**
   - `@ai_endpoint()` 装饰器自动处理 SSE
   - `AIStreamBuilder` 支持多种事件类型
   - 与 Vercel AI SDK 前端完全兼容

3. **消息格式**
   - LangChain 支持字典和消息对象两种格式
   - 推荐使用 `HumanMessage`/`AIMessage` 类型安全

4. **流式处理**
   - 使用 `async for` 异步迭代
   - `chunk.content` 获取文本内容
   - 注意处理空 chunk


---

## 8. Python 包管理 (uv)

本项目使用 `uv` 作为包管理器，替代 pip/poetry。

### 常用命令速查

```bash
# 初始化项目 (已完成)
uv init

# 添加依赖
uv add fastapi uvicorn[standard]
uv add --dev pytest

# 运行命令/脚本 (自动处理 venv)
uv run python app.py
uv run pytest

# 同步环境 (确保 venv 与 lock 文件一致)
uv sync

# 导出 requirements.txt (兼容传统部署)
uv pip compile pyproject.toml -o requirements.txt
```

### 为什么选择 uv?
1. **速度极快**: 基于 Rust 编写，通过全局缓存秒级安装。
2. **统一管理**: 同时管理 Python 版本、虚拟环境和依赖。
3. **确定性**: 严格的 `uv.lock` 锁定所有依赖树。


