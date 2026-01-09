# Assembler 重构 - 技术设计

## 1. 架构总览

### 1.1 重构后流程图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              用户请求 + 数据                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         阶段一: Planner (规划器)                             │
│                                                                              │
│  输入: 用户需求 + 数据 Schema + Knowledge                                    │
│  输出: Blueprint (扩展版)                                                    │
│    - component_specs: 业务组件规格列表                                       │
│    - colors_code: str          ⭐ 新增：完整的 colors.ts 代码                │
│    - base_components: list[str] ⭐ 新增：需要的基础组件列表                  │
│    - dependencies: 所需依赖                                                  │
│    - global_contract: 主题配置                                               │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────┬───────────┼───────────┬───────────────┐
        │               │           │           │               │
        ▼               ▼           ▼           ▼               ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Worker A    │ │ Worker B    │ │ Worker C    │ │ App Worker  │ │   ...       │
│ KpiChart    │ │ CostPie     │ │ Inventory   │ │ App.tsx     │ │             │
│   ↓         │ │   ↓         │ │   ↓         │ │   ↓         │ │             │
│ 语法校验 ✓  │ │ 语法校验 ✓  │ │ 语法校验 ✓  │ │ 语法校验 ✓  │ │             │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
        │               │           │           │               │
        └───────────────┴───────────┼───────────┴───────────────┘
                                    │
                        ⭐ 全部并行执行，各自校验
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    阶段二: Assembler (精简版)                                │
│                                                                              │
│  职责 (仅组装，不生成):                                                      │
│    1. 收集 Planner 输出的 colors_code → /utils/colors.ts                    │
│    2. 收集基础组件 (从 knowledge) → /components/ui/*.tsx                    │
│    3. 收集业务组件结果 → /components/*.tsx                                   │
│    4. 收集 App Worker 结果 → /App.tsx                                       │
│    5. 输出 MultiFileArtifact                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                            SSE 流式输出
```

### 1.2 并行执行策略

**关键设计**：App Worker 与 Business Workers **完全并行**

| Worker 类型 | 输入 | 输出 | 是否需要等待其他 Worker |
|-------------|------|------|------------------------|
| Business Worker | ComponentSpec | 组件代码 | ❌ 不需要 |
| App Worker | Blueprint (所有组件规格) | App.tsx | ❌ 不需要 |

**为什么 App Worker 不需要等待？**
- App Worker 只需要知道**组件名称和数据切片**，这些在 Blueprint 中已经有了
- 不需要知道组件的实际代码
- 如果某个业务组件失败，会被 Assembler 替换为 ErrorCard，import 语句仍然有效

**每个 Worker 的校验流程**：
```
Worker 生成代码
    ↓
tsx_validator 语法校验
    ↓
通过 → success=True, 返回代码
失败 → 重试 (最多 2 次)
    ↓
仍失败 → success=False, 返回错误
```

---

## 2. Blueprint 模型扩展

### 2.1 新增字段

```python
# app/models/blueprint.py

class Blueprint(BaseModel):
    # ... 现有字段 ...
    
    # ⭐ 新增：完整的 colors.ts 代码
    colors_code: str = Field(
        default="",
        description="Planner 生成的完整 colors.ts 代码"
    )
    
    # ⭐ 新增：需要的基础组件列表
    base_components: list[str] = Field(
        default_factory=lambda: ["ErrorCard", "DashboardCard", "ErrorBoundary", "Loading", "ErrorDisplay"],
        description="需要包含的基础 UI 组件"
    )
```

### 2.2 Planner Prompt 扩展

```python
# app/prompts/planner.py

# 新增 colors_code 生成要求
COLORS_CODE_INSTRUCTION = """
## Colors Code Generation

You must generate the complete `/utils/colors.ts` file content in the `colors_code` field.

Example:
```typescript
// Auto-generated color constants
export const COLORS = {
  primary: '#6366F1',
  secondary: '#22D3EE',
  success: '#22C55E',
  warning: '#EAB308',
  error: '#EF4444',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  text: '#1E293B',
  textMuted: '#64748B',
  border: '#E2E8F0',
  chart: ['#6366F1', '#22D3EE', '#F472B6', '#22C55E', '#F59E0B'],
};
```
"""
```

---

## 3. Knowledge 基础组件

### 3.1 目录结构

```
app/knowledge/
├── data/
│   ├── components/           ⭐ 新增：基础组件参考实现
│   │   ├── ErrorCard.tsx
│   │   ├── DashboardCard.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── Loading.tsx
│   │   └── ErrorDisplay.tsx
│   ├── charts.csv
│   ├── colors.csv
│   └── ...
├── component_loader.py       ⭐ 新增：组件加载器
└── ...
```

### 3.2 组件加载器

```python
# app/knowledge/component_loader.py

from pathlib import Path
from functools import lru_cache

COMPONENTS_DIR = Path(__file__).parent / "data" / "components"

@lru_cache(maxsize=10)
def load_base_component(name: str) -> str:
    """
    加载基础组件的参考实现。
    
    Args:
        name: 组件名称 (如 "ErrorCard", "DashboardCard")
        
    Returns:
        组件代码
    """
    filepath = COMPONENTS_DIR / f"{name}.tsx"
    if not filepath.exists():
        raise FileNotFoundError(f"Base component not found: {name}")
    
    return filepath.read_text(encoding="utf-8")


def load_all_base_components(names: list[str]) -> dict[str, str]:
    """
    加载多个基础组件。
    
    Returns:
        { "ErrorCard": "...", "DashboardCard": "...", ... }
    """
    return {name: load_base_component(name) for name in names}


def get_base_components_prompt(names: list[str]) -> str:
    """
    生成基础组件的 prompt 参考。
    
    用于注入到 App Worker 的 prompt 中，让 AI 了解可用的基础组件。
    """
    components = load_all_base_components(names)
    
    sections = []
    for name, code in components.items():
        sections.append(f"### {name}.tsx\n```tsx\n{code}\n```")
    
    return "## Available Base Components\n\n" + "\n\n".join(sections)
```

---

## 4. App Worker 设计

### 4.1 App Worker System Prompt

```python
# app/prompts/app_worker.py

APP_WORKER_SYSTEM_PROMPT = """You are a React App Entry Generator.
Your job is to generate a COMPLETE `/App.tsx` file that:
1. Fetches data from the API
2. Extracts data for each component
3. Renders all components in the correct layout

## File Structure

```tsx
import React, { useState, useEffect } from 'react';
import { COLORS } from './utils/colors';

// UI Components
import DashboardCard from './components/ui/DashboardCard';
import ErrorBoundary from './components/ui/ErrorBoundary';
import Loading from './components/ui/Loading';
import ErrorDisplay from './components/ui/ErrorDisplay';

// Business Components
import KpiChart from './components/KpiChart';
import CostPie from './components/CostPie';
// ... more imports

export default function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("API_URL")
      .then(res => res.json())
      .then(json => {
        // Data extraction logic
        setData(extracted);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <Loading />;
  if (error) return <ErrorDisplay error={error} />;
  if (!data) return <ErrorDisplay error="数据为空" />;

  // Data extraction for each component
  const kpiData = ...;
  const costData = ...;

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.background }}>
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>
      
      {/* Content */}
      <main className="w-full px-6 py-8">
        <div className="grid grid-cols-12 gap-6">
          {/* Components wrapped in DashboardCard and ErrorBoundary */}
        </div>
      </main>
    </div>
  );
}
```

## Critical Rules

1. ✅ Import ALL business components listed in the input
2. ✅ Use the exact `access_code` from component specs for data extraction
3. ✅ Wrap each component in `<ErrorBoundary>` and `<DashboardCard>`
4. ✅ Use COLORS from './utils/colors' for all styling
5. ✅ Handle loading and error states
6. ❌ NO hardcoded data
7. ❌ NO TypeScript advanced syntax (as, keyof, etc.)

## Layout Rules

- Use Tailwind CSS grid: `grid-cols-12`
- Use `width_weight` to calculate column span: `col-span-{weight * 12}`
- Group components by `section`
"""
```

### 4.2 App Worker User Prompt Template

```python
APP_WORKER_USER_PROMPT = """## Dashboard Configuration

**Title**: {dashboard_title}
**Subtitle**: {dashboard_subtitle}
**API URL**: {api_url}

## Business Components to Import

{component_list}

## Data Extraction Code for Each Component

{data_extractions}

## Layout Configuration

**Type**: {layout_type}
**Columns**: {columns}

### Sections

{sections_config}

## Available Base Components

{base_components_prompt}

---

Generate the complete `/App.tsx` file. Output ONLY the code, no explanations.
"""
```

### 4.3 App Worker 实现

```python
# app/core/app_worker.py

from dataclasses import dataclass
from typing import Optional

from langchain_core.messages import HumanMessage, AIMessage

from app.core.llm.client import LLMClient
from app.core.tsx_validator import validate_tsx
from app.models.blueprint import Blueprint
from app.prompts.app_worker import APP_WORKER_SYSTEM_PROMPT, build_app_worker_prompt
from app.knowledge.component_loader import get_base_components_prompt
from app.utils.logger import logger


@dataclass
class AppWorkerResult:
    """App Worker 生成结果"""
    code: str
    success: bool
    error: Optional[str] = None


class AppWorker:
    """
    生成 App.tsx 入口文件。
    
    特点：
    - 与 Business Workers 并行执行
    - 只需要 Blueprint，不需要等待组件代码
    - 自带语法校验，校验通过才返回成功
    """
    
    def __init__(self, llm_client: LLMClient = None):
        self.llm_client = llm_client or LLMClient()
        self.max_retries = 2
    
    async def generate_app(self, blueprint: Blueprint) -> AppWorkerResult:
        """
        生成 App.tsx（并行友好，不依赖其他 Worker 结果）。
        
        Args:
            blueprint: 包含所有组件规格、布局、数据源配置
            
        Returns:
            AppWorkerResult (code, success, error)
        """
        # 1. 获取基础组件参考
        base_prompt = get_base_components_prompt(blueprint.base_components)
        
        # 2. 构建 prompt（使用 Blueprint 中的所有组件规格）
        user_prompt = build_app_worker_prompt(
            blueprint=blueprint,
            base_components_prompt=base_prompt,
        )
        
        # 3. 生成 + 校验 + 重试
        chain = self.llm_client.get_chain(system_prompt=APP_WORKER_SYSTEM_PROMPT)
        messages = [HumanMessage(content=user_prompt)]
        
        for attempt in range(self.max_retries + 1):
            try:
                # 生成
                if attempt > 0:
                    logger.info(f"AppWorker: Retrying (Attempt {attempt})")
                
                response = await chain.ainvoke({"messages": messages})
                code = self._clean_code(response.content)
                
                # 语法校验
                validation = validate_tsx(code, filename="App.tsx")
                
                if validation.is_valid:
                    logger.info(f"AppWorker: Generated App.tsx ({len(code)} chars) ✓")
                    return AppWorkerResult(code=code, success=True)
                
                # 校验失败，准备重试
                if attempt < self.max_retries:
                    error_feedback = validation.to_ai_feedback()
                    logger.warning(f"AppWorker: Syntax errors, retrying...")
                    
                    messages.append(AIMessage(content=response.content))
                    messages.append(HumanMessage(
                        content=f"🚨 Syntax errors found:\n{error_feedback}\n\nPlease fix and regenerate."
                    ))
                else:
                    # 重试耗尽，返回失败
                    logger.error(f"AppWorker: Failed after {self.max_retries} retries")
                    return AppWorkerResult(
                        code=code,
                        success=False,
                        error=f"Syntax validation failed: {validation.errors}"
                    )
                    
            except Exception as e:
                logger.error(f"AppWorker error: {e}")
                return AppWorkerResult(code="", success=False, error=str(e))
        
        return AppWorkerResult(code="", success=False, error="Unknown error")
    
    def _clean_code(self, content: str) -> str:
        """清理生成的代码"""
        import re
        content = content.strip()
        
        # 移除 <think> 块
        content = re.sub(r"<think>.*?</think>\s*", "", content, flags=re.DOTALL | re.IGNORECASE)
        
        # 移除 markdown 代码块
        if content.startswith("```"):
            lines = content.split("\n")
            lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            content = "\n".join(lines)
        
        return content.strip()
```

---

## 5. Assembler 精简

### 5.1 新版 Assembler

```python
# app/core/assembler.py

from app.core.app_worker import AppWorkerResult

class DashboardAssembler:
    """
    精简版 Assembler - 仅负责文件组装。
    
    不再包含代码生成逻辑，所有代码都由 AI 或 knowledge 提供。
    语法校验已在各 Worker 中完成。
    """
    
    def assemble(
        self,
        blueprint: Blueprint,
        component_results: dict[str, ComponentResult],
        app_result: AppWorkerResult,
    ) -> MultiFileArtifact:
        """
        组装多文件 Dashboard。
        
        Args:
            blueprint: 包含 colors_code 和 base_components
            component_results: 业务组件结果 (已校验)
            app_result: App Worker 结果 (已校验)
            
        Returns:
            MultiFileArtifact
        """
        artifact = MultiFileArtifact(
            title=blueprint.dashboard_title,
            dependencies=blueprint.dependencies,
        )
        
        # 1. 添加 colors.ts (Planner 生成)
        artifact.add_file("/utils/colors.ts", blueprint.colors_code, "success")
        
        # 2. 添加基础组件 (从 knowledge 加载)
        from app.knowledge.component_loader import load_base_component
        for name in blueprint.base_components:
            code = load_base_component(name)
            artifact.add_file(f"/components/ui/{name}.tsx", code, "success")
        
        # 3. 添加业务组件 (已在 Worker 中校验)
        for spec in blueprint.component_specs:
            result = component_results.get(spec.id)
            file_path = f"/components/{spec.component_name}.tsx"
            
            if result is None or not result.success:
                # 失败组件使用 ErrorCard 包装
                error_code = self._generate_error_wrapper(spec, result.error if result else "Not generated")
                artifact.add_file(file_path, error_code, "failed")
                artifact.failed_components.append(spec.id)
            else:
                artifact.add_file(file_path, result.code, "success")
        
        # 4. 添加 App.tsx (已在 App Worker 中校验)
        if app_result.success:
            artifact.add_file("/App.tsx", app_result.code, "success")
        else:
            # App.tsx 生成失败，使用 fallback
            fallback_code = self._generate_fallback_app(blueprint, app_result.error)
            artifact.add_file("/App.tsx", fallback_code, "failed")
        
        logger.info(
            f"Assembler: {artifact.file_count} files "
            f"({artifact.success_count} success, {artifact.failed_count} failed)"
        )
        
        return artifact
    
    def _generate_error_wrapper(self, spec, error: str) -> str:
        """生成失败组件的 ErrorCard 包装（极简）"""
        safe_error = error.replace("'", "\\'").replace('"', '\\"')
        return f"""import ErrorCard from './ui/ErrorCard';

export default function {spec.component_name}() {{
  return <ErrorCard title="{spec.component_name} 生成失败" error="{safe_error}" />;
}}
"""
    
    def _generate_fallback_app(self, blueprint, error: str) -> str:
        """App.tsx 生成失败时的 fallback"""
        safe_error = error.replace("'", "\\'").replace('"', '\\"')
        return f"""import ErrorDisplay from './components/ui/ErrorDisplay';

export default function App() {{
  return <ErrorDisplay error="App.tsx 生成失败: {safe_error}" />;
}}
"""
```

### 5.2 删除的代码

从 `assembler.py` 中移除：
- `_generate_colors_file()` - 由 Planner 生成
- `_generate_app_entry()` - 由 App Worker 生成
- `_clean_component_code()` - 移到 Worker 中
- `_to_camel_case()` - 移到工具函数中

从项目中删除：
- `app/core/templates.py` - 完全移除

---

## 6. Pipeline 更新

### 6.1 并行执行策略

```python
# app/core/pipeline.py

import asyncio
from app.core.app_worker import AppWorker, AppWorkerResult

class PipelineExecutor:
    
    def __init__(self):
        self.planner = DashboardPlanner()
        self.orchestrator = WorkerOrchestrator()
        self.app_worker = AppWorker()
        self.assembler = DashboardAssembler()
    
    async def execute_streaming(self, ...):
        # Step 1: Planner
        blueprint = await self.planner.plan(...)
        
        yield StreamEvent(type=EventType.THINKING, content="✅ 规划完成...")
        
        # Step 2: 并行执行所有 Workers (Business + App)
        yield StreamEvent(type=EventType.THINKING, 
            content=f"🔧 正在并行生成 {len(blueprint.component_specs) + 1} 个文件...")
        
        # 并行启动：Business Workers + App Worker
        component_results = {}
        app_result: AppWorkerResult = None
        
        # 使用 asyncio.gather 并行执行
        async def run_business_workers():
            results = {}
            async for current, total, result in self.orchestrator.generate_with_progress(blueprint):
                results[result.component_id] = result
                yield StreamEvent(type=EventType.PROGRESS, ...)
            return results
        
        async def run_app_worker():
            return await self.app_worker.generate_app(blueprint)
        
        # 方案 A: 使用 as_completed 实时返回结果
        # 方案 B: 使用 gather 等待全部完成
        # 这里采用方案 B 简化实现
        
        business_task = asyncio.create_task(
            self._collect_business_results(blueprint)
        )
        app_task = asyncio.create_task(
            self.app_worker.generate_app(blueprint)
        )
        
        # 等待所有任务完成
        component_results, app_result = await asyncio.gather(business_task, app_task)
        
        # 发送 App Worker 状态
        if app_result.success:
            yield StreamEvent(type=EventType.THINKING, content="✅ App.tsx 生成完成")
        else:
            yield StreamEvent(type=EventType.THINKING, 
                content=f"⚠️ App.tsx 生成失败: {app_result.error}")
        
        # Step 3: Assembler (仅组装)
        artifact = self.assembler.assemble(
            blueprint=blueprint,
            component_results=component_results,
            app_result=app_result,
        )
        
        # Step 4: 输出
        yield StreamEvent(type=EventType.ARTIFACT_START, ...)
        for path, code in artifact.files.items():
            yield StreamEvent(type=EventType.ARTIFACT_FILE, ...)
        yield StreamEvent(type=EventType.ARTIFACT_END, ...)
    
    async def _collect_business_results(self, blueprint) -> dict:
        """收集业务组件生成结果"""
        results = {}
        async for current, total, result in self.orchestrator.generate_with_progress(blueprint):
            results[result.component_id] = result
        return results
```

### 6.2 并行执行时序图

```
时间 →

Planner:    [████████████]
                         ↓ Blueprint 输出
                         
Workers:                 [████ Worker A ████]  → 校验 ✓
(并行)                   [██████ Worker B ██████]  → 校验 ✓
                         [████████ Worker C ████████]  → 校验 ✓
                         [██████████ App Worker ██████████]  → 校验 ✓
                                                    ↓ 全部完成
                                                    
Assembler:                                         [███]
                                                       ↓
SSE Output:                                            [███████]
```

**优势**：
- App Worker 不再是瓶颈
- 总时间 ≈ max(所有 Worker 时间)，而非 sum
- 每个 Worker 自带校验，减少后期失败

---

## 7. 数据流总结

```
┌────────────────────────────────────────────────────────────────────┐
│                           Planner                                   │
│                                                                     │
│  输入: user_message, schema, knowledge                              │
│  输出: Blueprint {                                                  │
│    component_specs: [...],                                          │
│    colors_code: "export const COLORS = {...}",   ← 完整代码        │
│    base_components: ["ErrorCard", "DashboardCard", ...],            │
│    dependencies: {...},                                             │
│  }                                                                  │
└────────────────────────────────────────────────────────────────────┘
                              │
      ┌───────────────────────┼───────────────────────┐
      │                       │                       │
      ▼                       ▼                       ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Business Worker │  │ Business Worker │  │   App Worker    │
│   (并行)        │  │   (并行)        │  │   (并行) ⭐     │
│       ↓         │  │       ↓         │  │       ↓         │
│   语法校验      │  │   语法校验      │  │   语法校验      │
│       ↓         │  │       ↓         │  │       ↓         │
│ ComponentResult │  │ ComponentResult │  │ AppWorkerResult │
└─────────────────┘  └─────────────────┘  └─────────────────┘
      │                       │                       │
      └───────────────────────┼───────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────────┐
│                          Assembler                                  │
│                                                                     │
│  输入 (全部已校验，只需组装):                                       │
│    - blueprint.colors_code → /utils/colors.ts                      │
│    - knowledge.base_components → /components/ui/*.tsx              │
│    - component_results (已校验) → /components/*.tsx                │
│    - app_result (已校验) → /App.tsx                                │
│                                                                     │
│  输出: MultiFileArtifact                                            │
└────────────────────────────────────────────────────────────────────┘
```

### 7.1 并行执行优势

| 指标 | 串行执行 | 并行执行 |
|------|----------|----------|
| **总时间** | sum(所有 Worker 时间) | max(所有 Worker 时间) |
| **示例** | 5个组件×10s + App 15s = 65s | max(50s, 15s) ≈ 50s |
| **提升** | - | **~23% 更快** |

### 7.2 校验职责分离

| 阶段 | 校验内容 | 责任方 |
|------|----------|--------|
| Worker 生成后 | TSX 语法校验 | 各 Worker 自己 |
| Assembler 组装后 | 无（已在 Worker 完成） | - |
| 最终输出前 | 可选的最终检查 | Pipeline（可选） |

