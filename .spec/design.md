# 后端技术设计

## 一、架构概览

### 1.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              浏览器                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Next.js 前端 (已完成)                         │   │
│  │  ┌─────────────────┐              ┌─────────────────────────┐  │   │
│  │  │   Chat Panel    │   Artifact   │    Sandpack Preview     │  │   │
│  │  │ (Vercel AI SDK) │─────────────▶│    (React 沙箱执行)     │  │   │
│  │  └────────┬────────┘              └─────────────────────────┘  │   │
│  └───────────┼──────────────────────────────────────────────────────┘   │
│              │ SSE Stream                                                │
└──────────────┼──────────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Python 后端服务 (本设计)                             │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                           FastAPI                                   │ │
│  │                                                                     │ │
│  │   /api/chat ────────▶ ChatService ────────▶ LLMClient              │ │
│  │       │                    │                    │                   │ │
│  │       │                    ▼                    │                   │ │
│  │       │              MemoryManager              │                   │ │
│  │       │                    │                    │                   │ │
│  │       ▼                    ▼                    ▼                   │ │
│  │  StreamHandler ◀──── SystemPrompt ◀──── LangChain                  │ │
│  │       │                                                             │ │
│  │       ▼                                                             │ │
│  │   AIStreamBuilder (fastapi-ai-sdk)                                  │ │
│  │       │                                                             │ │
│  │       ▼                                                             │ │
│  │   SSE Response ──────────────────────────────────────────▶ 前端    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                        外部 LLM 服务                               │  │
│  │   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐            │  │
│  │   │   OpenAI    │   │  Anthropic  │   │   Google    │            │  │
│  │   │   GPT-4o    │   │   Claude    │   │   Gemini    │            │  │
│  │   └─────────────┘   └─────────────┘   └─────────────┘            │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 技术栈

| 层级 | 技术 | 版本 | 说明 |
|-----|------|------|------|
| Web 框架 | FastAPI | 0.115+ | 异步 Web 框架 |
| LLM 框架 | LangChain | 0.3+ | 多模型集成 |
| AI SDK 兼容 | fastapi-ai-sdk | 0.2+ | Vercel AI SDK 协议 |
| 数据验证 | Pydantic | 2.0+ | 类型安全 |
| 服务器 | Uvicorn | 0.30+ | ASGI 服务器 |

---

## 二、项目结构

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                 # 应用入口
│   ├── config.py               # 配置管理
│   │
│   ├── api/                    # API 路由
│   │   ├── __init__.py
│   │   ├── router.py           # 路由注册
│   │   ├── chat.py             # POST /api/chat
│   │   ├── sessions.py         # 会话管理接口
│   │   └── settings.py         # 设置接口
│   │
│   ├── core/                   # 核心逻辑
│   │   ├── __init__.py
│   │   ├── llm/
│   │   │   ├── __init__.py
│   │   │   ├── client.py       # LLM 客户端
│   │   │   └── providers.py    # 提供商配置
│   │   ├── stream_parser.py    # 流式解析器
│   │   └── memory.py           # 会话历史
│   │
│   ├── prompts/                # Prompt 模板与约束
│   │   ├── __init__.py         # 统一导出入口
│   │   ├── shared.py           # 🔑 公共约束中心 (SYNTAX_RULES, NAMING_RULES, etc.)
│   │   ├── system.py           # 直接对话模式 System Prompt
│   │   ├── planner.py          # Planner AI 提示词
│   │   ├── worker.py           # Worker AI 提示词
│   │   └── data_aware.py       # 数据上下文构建器
│   │
│   ├── models/                 # Pydantic 模型
│   │   ├── __init__.py
│   │   ├── chat.py
│   │   ├── session.py
│   │   └── errors.py
│   │
│   └── utils/
│       ├── __init__.py
│       └── logger.py
│
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   └── test_chat.py
│
├── requirements.txt
├── .env.example
└── Dockerfile
```

---

## 三、核心模块设计

### 3.1 配置模块 (config.py)

```python
from pydantic_settings import BaseSettings
from typing import Literal
from functools import lru_cache


class Settings(BaseSettings):
    """应用配置，支持环境变量覆盖"""
    
    # 应用
    app_name: str = "Nexus AI Backend"
    debug: bool = False
    cors_origins: list[str] = ["http://localhost:3000"]
    
    # LLM 默认配置
    default_provider: Literal["openai", "anthropic", "google"] = "openai"
    default_model: str = "gpt-4o"
    llm_temperature: float = 0.7
    llm_max_tokens: int = 4096
    
    # API Keys (可选，也可由前端传入)
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    google_api_key: str | None = None
    
    # 会话配置
    session_ttl_seconds: int = 3600
    max_history_messages: int = 50
    
    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

### 3.2 LLM 客户端 (core/llm/client.py)

```python
from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import BaseMessage, SystemMessage
from typing import AsyncIterator, Literal

from app.config import get_settings
from app.prompts.system import SYSTEM_PROMPT


Provider = Literal["openai", "anthropic", "google"]


class LLMClient:
    """
    多模型 LLM 客户端
    使用 LangChain init_chat_model 统一接口
    
    支持格式:
    - init_chat_model("openai:gpt-4o")
    - init_chat_model("anthropic:claude-sonnet-4-5-20250514")
    """
    
    # 各提供商默认模型
    DEFAULT_MODELS = {
        "openai": "gpt-4o",
        "anthropic": "claude-sonnet-4-5-20250514",
        "google": "gemini-2.0-flash",
    }
    
    def __init__(
        self,
        provider: Provider = "openai",
        model: str | None = None,
        api_key: str | None = None,
    ):
        self.provider = provider
        self.model = model or self.DEFAULT_MODELS.get(provider, "gpt-4o")
        self.api_key = api_key
        self._client: BaseChatModel | None = None
    
    @property
    def client(self) -> BaseChatModel:
        """懒加载 LangChain 客户端"""
        if self._client is None:
            settings = get_settings()
            
            # API Key 优先级: 参数 > 环境变量
            api_key = self.api_key or getattr(
                settings, 
                f"{self.provider}_api_key", 
                None
            )
            
            if not api_key:
                raise ValueError(f"API key required for {self.provider}")
            
            # 使用 "provider:model" 格式初始化
            model_string = f"{self.provider}:{self.model}"
            
            self._client = init_chat_model(
                model_string,
                api_key=api_key,
                temperature=settings.llm_temperature,
                max_tokens=settings.llm_max_tokens,
            )
        return self._client
    
    async def astream(
        self,
        messages: list[BaseMessage],
        system_prompt: str | None = None,
    ) -> AsyncIterator[str]:
        """
        异步流式生成响应
        
        Args:
            messages: 对话消息列表
            system_prompt: 可选的系统提示词
            
        Yields:
            生成的文本块
        """
        # 构建消息列表
        full_messages = [
            SystemMessage(content=system_prompt or SYSTEM_PROMPT)
        ] + messages
        
        # 异步流式输出
        async for chunk in self.client.astream(full_messages):
            # chunk 是 AIMessageChunk，content 可能是字符串或列表
            if chunk.content:
                if isinstance(chunk.content, str):
                    yield chunk.content
                elif isinstance(chunk.content, list):
                    # 处理多模态内容块
                    for block in chunk.content:
                        if isinstance(block, dict) and block.get("type") == "text":
                            yield block.get("text", "")
                        elif isinstance(block, str):
                            yield block
```

### 3.3 流式解析器 (core/stream_parser.py)

```python
from enum import Enum
from dataclasses import dataclass

class EventType(str, Enum):
    THINKING = "thinking"
    MESSAGE = "message"
    ARTIFACT_START = "artifact_start"
    ARTIFACT_CODE = "artifact_code"
    ARTIFACT_END = "artifact_end"
    SESSION_ID = "session_id"
    ERROR = "error"

class StreamParser:
    """
    负责将 LLM 的文本流解析为结构化的 SSE 事件。
    识别 <think> 和 <artifact> 标签，并转换为对应的事件流。
    """
    def feed(self, chunk: str) -> list[StreamEvent]:
        # 内部状态机逻辑，处理标签边界和内容缓冲
        pass
```

### 3.4 Chat Service (api/chat.py)

```python
async def generate_stream(llm_client, messages, session_id):
    # 1. 发送 Session ID
    if session_id:
        yield StreamEvent(type=EventType.SESSION_ID, content=session_id).to_sse()

    # 2. 调用 LLM 并通过 StreamParser 解析
    async for chunk in llm_client.astream(messages):
        for event in parser.feed(chunk):
            yield event.to_sse()
```

### 3.4 会话历史管理 (core/memory.py)

```python
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage
from typing import Dict, List
from datetime import datetime
import asyncio

from app.config import get_settings


class InMemoryStore:
    """内存会话存储"""
    
    def __init__(self):
        self._sessions: Dict[str, Dict] = {}
        self._lock = asyncio.Lock()
    
    async def get_messages(self, session_id: str) -> List[BaseMessage]:
        async with self._lock:
            session = self._sessions.get(session_id, {})
            return session.get("messages", [])
    
    async def add_message(self, session_id: str, message: BaseMessage):
        settings = get_settings()
        
        async with self._lock:
            if session_id not in self._sessions:
                self._sessions[session_id] = {
                    "messages": [],
                    "created_at": datetime.now(),
                    "updated_at": datetime.now(),
                }
            
            session = self._sessions[session_id]
            session["messages"].append(message)
            session["updated_at"] = datetime.now()
            
            # 限制历史长度
            if len(session["messages"]) > settings.max_history_messages:
                session["messages"] = session["messages"][-settings.max_history_messages:]
    
    async def delete_session(self, session_id: str) -> bool:
        async with self._lock:
            if session_id in self._sessions:
                del self._sessions[session_id]
                return True
            return False
    
    async def list_sessions(self) -> List[dict]:
        async with self._lock:
            return [
                {
                    "session_id": sid,
                    "message_count": len(s["messages"]),
                    "created_at": s["created_at"].isoformat(),
                    "updated_at": s["updated_at"].isoformat(),
                }
                for sid, s in self._sessions.items()
            ]
    
    async def get_session(self, session_id: str) -> dict | None:
        async with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return None
            return {
                "session_id": session_id,
                "message_count": len(session["messages"]),
                "messages": [
                    {
                        "role": "user" if isinstance(m, HumanMessage) else "assistant",
                        "content": m.content,
                    }
                    for m in session["messages"]
                ],
                "created_at": session["created_at"].isoformat(),
                "updated_at": session["updated_at"].isoformat(),
            }


# 单例
_memory_instance: InMemoryStore | None = None

def get_memory() -> InMemoryStore:
    global _memory_instance
    if _memory_instance is None:
        _memory_instance = InMemoryStore()
    return _memory_instance
```

### 3.5 Prompt 模块架构 (prompts/)

项目使用分层的 **Prompt 约束架构**，确保所有 AI 代理生成一致、无错误的代码。

#### 3.5.1 共享约束 (prompts/shared.py)

```python
# Recharts 组件强制别名映射 (避免与 lucide-react 冲突)
RECHARTS_ALIAS_MAP = {
    "PieChart": "RePieChart",
    "BarChart": "ReBarChart",
    "LineChart": "ReLineChart",
    # ...
}

# 常用 Lucide 图标
LUCIDE_COMMON_ICONS = ["TrendingUp", "TrendingDown", "Clock", "DollarSign", ...]

# 禁用的 TypeScript 语法模式 (防止 SyntaxError)
SYNTAX_RULES = """
| Pattern | Why It Crashes | Safe Alternative |
|---------|---------------|------------------|
| `x as Type` | TS type assertion | Use `const x: Type = ...` |
| `x as keyof typeof obj` | TS advanced typing | Use `obj[x]` |
| `: value is Type` | TS type predicate | Remove return type |
"""

# 命名规范 (防止全局作用域冲突)
NAMING_RULES = """
- 所有顶层定义必须使用 `ComponentId_` 前缀
- 常量和辅助函数应定义在组件内部
"""

# Recharts 使用规范
RECHARTS_RULES = """
- 必须使用 RePieChart, ReBarChart 等别名
- 必须用 ResponsiveContainer 包裹
- Pie 内部必须有 Cell
"""

# 输出格式规范
OUTPUT_RULES = """
- 只返回原始代码，不包含 Markdown 代码块
- 不包含 import 语句（由 Assembler 注入）
"""

# 便捷组合
WORKER_CONSTRAINTS = get_shared_constraints(include_recharts=True, include_output_rules=True)
PLANNER_CONSTRAINTS = get_shared_constraints(include_recharts=False, include_output_rules=False)
```

#### 3.5.2 Planner 提示词 (prompts/planner.py)

```python
# 用于生成 Blueprint (组件规划)
PLANNER_SYSTEM_PROMPT = """You are an expert Dashboard Architect...

## Key Design Principles
1. Component Atomicity - 每个组件专注于一个可视化
2. Data Access Authority - 精确的数据访问路径
3. TypeScript Interface Generation - 简单接口，禁止高级 TS 语法
"""
```

#### 3.5.3 Worker 提示词 (prompts/worker.py)

```python
from app.prompts.shared import WORKER_CONSTRAINTS

WORKER_SYSTEM_PROMPT = f"""You are a React Component Specialist...

{WORKER_CONSTRAINTS}  # 注入共享约束

## Example Output
interface SalesChart_Props {{ ... }}
function SalesChart({{ data }}: SalesChart_Props) {{ ... }}
"""
```

#### 3.5.4 System Prompt (prompts/system.py) - 直接对话模式

```python
from app.prompts.shared import SYNTAX_RULES, RECHARTS_RULES

SYSTEM_PROMPT = f"""You are Nexus AI, an expert React UI Engineer...

{SYNTAX_RULES}   # 注入语法约束
{RECHARTS_RULES} # 注入 Recharts 规范

## Output Format
<artifact identifier="kebab-case-id" type="react" title="标题">
export default function App() {{ ... }}
</artifact>
"""
```

#### 3.5.5 使用方式

```python
# 在 Worker 中使用
from app.prompts.worker import WORKER_SYSTEM_PROMPT, build_worker_prompt

# 在 Planner 中使用
from app.prompts.planner import PLANNER_SYSTEM_PROMPT, build_planner_prompt

# 在 Assembler 中使用共享常量
from app.prompts.shared import RECHARTS_ALIAS_MAP, LUCIDE_COMMON_ICONS
```

---

## 四、API 路由设计

### 4.1 路由注册 (api/router.py)

```python
from fastapi import APIRouter

from app.api import chat, sessions, settings

api_router = APIRouter()

api_router.include_router(chat.router, tags=["chat"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
```

### 4.2 聊天接口 (api/chat.py)

```python
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.models.chat import ChatRequest
from app.api.deps import LLMClientDep

router = APIRouter()


@router.post("/chat")
async def chat(request: ChatRequest, llm_client: LLMClientDep):
    """
    流式聊天接口
    
    返回 SSE 格式，包含 thinking, message, artifact 等自定义事件
    """
    return StreamingResponse(
        generate_stream(
            llm_client=llm_client,
            messages=request.messages,
            session_id=request.session_id,
        ),
        media_type="text/event-stream"
    )
```

### 4.3 会话接口 (api/sessions.py)

```python
from fastapi import APIRouter, HTTPException

from app.core.memory import get_memory
from app.models.session import SessionResponse, SessionListResponse

router = APIRouter()


@router.get("", response_model=SessionListResponse)
async def list_sessions():
    """获取所有会话"""
    memory = get_memory()
    sessions = await memory.list_sessions()
    return {"sessions": sessions}


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str):
    """获取会话详情"""
    memory = get_memory()
    session = await memory.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/{session_id}")
async def delete_session(session_id: str):
    """删除会话"""
    memory = get_memory()
    deleted = await memory.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True}
```

### 4.4 设置接口 (api/settings.py)

```python
from fastapi import APIRouter

from app.config import get_settings
from app.core.llm.providers import PROVIDER_MODELS
from app.models.settings import ModelsResponse, ValidateKeyRequest, ValidateKeyResponse

router = APIRouter()


@router.get("/models", response_model=ModelsResponse)
async def get_models():
    """获取可用模型列表"""
    settings = get_settings()
    
    providers = []
    for provider_id, models in PROVIDER_MODELS.items():
        api_key = getattr(settings, f"{provider_id}_api_key", None)
        providers.append({
            "id": provider_id,
            "name": provider_id.title(),
            "models": models,
            "configured": bool(api_key),
        })
    
    return {
        "providers": providers,
        "default_provider": settings.default_provider,
        "default_model": settings.default_model,
    }


@router.post("/validate-key", response_model=ValidateKeyResponse)
async def validate_key(request: ValidateKeyRequest):
    """验证 API Key 有效性"""
    from app.core.llm.client import LLMClient
    
    try:
        client = LLMClient(
            provider=request.provider,
            api_key=request.api_key,
        )
        # 发送测试请求
        async for _ in client.astream([]):
            break
        return {"valid": True}
    except Exception as e:
        return {"valid": False, "error": str(e)}
```

---

## 五、Pydantic 模型

### 5.1 聊天模型 (models/chat.py)

```python
from pydantic import BaseModel
from typing import Literal


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    session_id: str | None = None
    provider: str | None = None
    model: str | None = None
    api_key: str | None = None
```

### 5.2 会话模型 (models/session.py)

```python
from pydantic import BaseModel


class SessionInfo(BaseModel):
    session_id: str
    message_count: int
    created_at: str
    updated_at: str


class SessionResponse(SessionInfo):
    messages: list[dict]


class SessionListResponse(BaseModel):
    sessions: list[SessionInfo]
```

### 5.3 设置模型 (models/settings.py)

```python
from pydantic import BaseModel


class ModelInfo(BaseModel):
    id: str
    name: str
    description: str | None = None


class ProviderInfo(BaseModel):
    id: str
    name: str
    models: list[ModelInfo]
    configured: bool


class ModelsResponse(BaseModel):
    providers: list[ProviderInfo]
    default_provider: str
    default_model: str


class ValidateKeyRequest(BaseModel):
    provider: str
    api_key: str


class ValidateKeyResponse(BaseModel):
    valid: bool
    error: str | None = None
```

---

## 六、应用入口 (main.py)

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.api.router import api_router


def create_app() -> FastAPI:
    settings = get_settings()
    
    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
    )
    
    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # 路由
    app.include_router(api_router, prefix="/api")
    
    # 健康检查
    @app.get("/health")
    async def health():
        return {"status": "healthy"}
    
    return app


app = create_app()
```

---

## 七、依赖清单 (requirements.txt)

```

# Web
fastapi>=0.115.0
uvicorn[standard]>=0.30.0
python-multipart>=0.0.9

# LangChain
langchain>=0.3.0
langchain-core>=0.3.0
langchain-openai>=0.2.0
langchain-anthropic>=0.2.0
langchain-google-genai>=2.0.0

# 配置
pydantic>=2.0.0
pydantic-settings>=2.0.0
python-dotenv>=1.0.0

# 日志
loguru>=0.7.0
```

