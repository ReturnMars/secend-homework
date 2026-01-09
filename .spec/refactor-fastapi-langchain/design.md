# 后端重构：FastAPI & LangChain 现代化改造

## 1. 架构变更

### A. 生命周期管理 (Lifespan)
- **问题**: 缺乏统一的应用生命周期管理；存在资源泄露风险（例如 HTTP 客户端未关闭）。
- **解决方案**: 采用 FastAPI `lifespan` (ASGI 标准)。
  - 在 `main.py` 中定义 `@asynccontextmanager async def lifespan(app: FastAPI)`。
  - 在启动时初始化全局资源（共享 HTTP 客户端 / LLM 客户端池）。
  - 在关闭时清理资源。

### B. 依赖注入 (DI)
- **问题**: `api/chat.py` 手动实例化 `LLMClient`，导致紧耦合。
- **解决方案**: 使用 FastAPI 的 `Depends` 和 `Annotated`。
  - 创建 `app/api/deps.py`。
  - 定义 `get_llm_client`。
  - 在路由处理函数中使用 `Annotated[LLMClient, Depends(get_llm_client)]`。

### C. AI 核心: LCEL (LangChain Expression Language)
- **问题**: `LLMClient.astream` 中存在大量手动字符串缓冲和逻辑。
- **解决方案**: 使用 LCEL `Runnable` 模式。
  - `LLMClient` 方法作为工厂返回配置好的 `Runnable` (Chain)。
  - `Runnable` 结构: `Prompt | ChatModel | OutputParser`。
  - 使用 `astream_events` 进行统一的事件流传输（支持 `on_chat_model_stream`, `on_tool_start` 等）。

## 2. 代码规范

### Pydantic V2
- 修复 "默认值陷阱": 对于可变类型或动态值（如 `datetime.now`），使用 `Field(default_factory=func)` 而不是 `default=func()`。
- 强制使用 `model_dump(mode='json')` 进行序列化。

### 类型安全
- 对所有 FastAPI 参数（`Query`, `Path`, `Body`, `Depends`）使用 `Annotated`。
