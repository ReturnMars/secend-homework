# 重构任务清单

## 第一阶段：基础与修复 (Phase 1)
- [x] **修复 Pydantic Bug**: 更新 `app/models/base.py` 使用 `Field(default_factory=datetime.now)` 以避免静态时间戳问题。
- [x] **标准化依赖 (Deps)**: 创建 `app/api/deps.py` 并实现 `get_settings` 和 `get_llm_client` 依赖项。

## 第二阶段：架构升级 (Phase 2)
- [x] **实现 Lifespan**: 重构 `app/main.py` 以使用 `lifespan` 上下文管理器。
- [x] **重构 LLM Client**: 更新 `app/core/llm/client.py` 以支持 LCEL 模式（返回 Runnables），并在必要时使用持久化 httpx 客户端。

## 第三阶段：路由与流式传输 (Phase 3)
- [x] **重构 Chat API**: 更新 `app/api/chat.py`：
  - 通过 `Depends` 注入 `LLMClient`。
  - 使用 LCEL 链的 `astream_events` (v2)。
  - 简化事件解析逻辑（标准化为 LCEL 事件）。

## 第四阶段：验证 (Phase 4)
- [x] **测试流式传输**: 验证 `test_stream.html` 与新后端的兼容性 (已通过 Unit Test 模拟 SSE 验证)。
- [x] **运行测试**: 确保现有 `pytest` 测试套件通过 (api/test_chat_api.py Passed).
