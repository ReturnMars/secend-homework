# 多文件 Dashboard 架构 - 实施任务

## 任务概览

| Phase | 任务数 | 预计时间 | 依赖 | 状态 |
|-------|--------|----------|------|------|
| Phase 1: 数据模型 | 3 | 0.5 天 | 无 | ✅ 完成 |
| Phase 2: Worker 改造 | 4 | 1 天 | Phase 1 | ✅ 完成 |
| Phase 3: Assembler 改造 | 5 | 1.5 天 | Phase 2 | ✅ 完成 |
| Phase 4: 语法验证 | 2 | 0.5 天 | Phase 2 | ⏳ 待做 |
| Phase 5: Pipeline 集成 | 4 | 1 天 | Phase 3, 4 | ✅ 完成 |
| Phase 6: SSE 协议 | 3 | 0.5 天 | Phase 5 | ✅ 完成 |
| **合计** | **21** | **5 天** | - | **80% 完成** |

---

## Phase 1: 数据模型更新

### Task 1.1: 更新 Blueprint 模型
**文件**: `app/models/blueprint.py`
**优先级**: P0
**预计时间**: 1h

**变更内容**:
```python
class Blueprint(BaseModel):
    # 新增字段
    dependencies: dict[str, str] = Field(
        default_factory=lambda: {
            "recharts": "^2.12.0",
            "lucide-react": "^0.424.0",
        }
    )
```

**验收标准**:
- [ ] Blueprint 包含 dependencies 字段
- [ ] 默认依赖包含 recharts 和 lucide-react

---

### Task 1.2: 创建 MultiFileArtifact 模型
**文件**: `app/models/artifact.py` (新建)
**优先级**: P0
**预计时间**: 1h

**内容**:
```python
from pydantic import BaseModel
from typing import Literal

class MultiFileArtifact(BaseModel):
    """多文件 artifact 结构"""
    type: Literal["react-multi-file"] = "react-multi-file"
    title: str
    entry: str = "/App.js"
    files: dict[str, str]                    # path -> code
    file_status: dict[str, str] = {}         # path -> "success" | "failed"
    dependencies: dict[str, str] = {}        # package -> version
    failed_components: list[str] = []        # 失败的组件 ID
```

**验收标准**:
- [ ] 模型可正确序列化为 JSON
- [ ] files 字典包含完整路径

---

### Task 1.3: 更新 PipelineResult 模型
**文件**: `app/models/pipeline.py` 或现有位置
**优先级**: P0
**预计时间**: 0.5h

**变更内容**:
```python
class PipelineResult(BaseModel):
    artifact: MultiFileArtifact
    summary: str
    component_count: int
    success_count: int
    failed_count: int
```

**验收标准**:
- [ ] PipelineResult 使用 MultiFileArtifact

---

## Phase 2: Worker 改造

### Task 2.1: 更新 Worker System Prompt
**文件**: `app/prompts/worker.py`
**优先级**: P0
**预计时间**: 2h

**主要变更**:
1. 强调生成"完整独立文件"
2. 必须包含 import 语句
3. 必须使用 `export default`
4. 颜色从 `../utils/colors` 导入

**新 System Prompt 结构**:
```
1. 文件结构要求 (imports → interfaces → component)
2. Import 规则 (固定路径)
3. Export 规则 (必须 export default)
4. 示例完整文件
```

**验收标准**:
- [ ] Worker 生成的代码以 import 开头
- [ ] Worker 生成的代码包含 `export default function`
- [ ] 颜色使用 `import { COLORS } from '../utils/colors'`

---

### Task 2.2: 更新 Worker User Prompt Template
**文件**: `app/prompts/worker.py`
**优先级**: P0
**预计时间**: 1h

**变更内容**:
- 移除 `component_id` 前缀相关内容
- 添加文件路径信息
- 简化命名规则 (不再需要前缀)

**验收标准**:
- [ ] Prompt 明确组件应使用 `export default`
- [ ] 不再要求组件使用前缀命名

---

### Task 2.3: 更新 ComponentWorker 类
**文件**: `app/core/worker.py`
**优先级**: P0
**预计时间**: 1h

**变更内容**:
```python
class ComponentWorker:
    async def generate_component(
        self, spec: ComponentSpec, ...
    ) -> tuple[str, bool]:
        """
        Returns:
            (code, is_success)
        """
        # 生成完整独立文件
        # 不再需要清洗 import
```

**验收标准**:
- [ ] Worker 返回完整文件代码
- [ ] 返回值包含成功/失败状态

---

### Task 2.4: 移除 Worker 代码清洗逻辑
**文件**: `app/core/worker.py`
**优先级**: P1
**预计时间**: 1h

**变更内容**:
- 移除 import 清洗 (现在需要保留)
- 保留基本语法修复 (如连字符修复)
- 简化代码处理逻辑

**验收标准**:
- [ ] Worker 输出包含完整 import 语句
- [ ] 不再移除 export 关键字

---

## Phase 3: Assembler 改造

### Task 3.1: 重构 assemble 方法返回类型
**文件**: `app/core/assembler.py`
**优先级**: P0
**预计时间**: 2h

**变更内容**:
```python
def assemble(
    self,
    blueprint: Blueprint,
    component_codes: dict[str, str],
    failed_components: set[str] = None,
) -> dict[str, str]:
    """
    返回文件字典而非单个代码字符串
    
    Returns:
        {
            "/App.js": "...",
            "/components/Kpi.jsx": "...",
            "/utils/colors.js": "...",
        }
    """
```

**验收标准**:
- [ ] 返回类型为 dict[str, str]
- [ ] 包含 /App.js, /components/*.jsx, /utils/colors.js

---

### Task 3.2: 实现 _generate_colors_file
**文件**: `app/core/assembler.py`
**优先级**: P0
**预计时间**: 1h

**规格**:
```python
def _generate_colors_file(self, blueprint: Blueprint) -> str:
    """生成 /utils/colors.js"""
    # 从 blueprint.global_contract.colors 提取
    # 输出 export const COLORS = { ... };
```

**验收标准**:
- [ ] 生成有效的 JS export 语句
- [ ] 包含所有颜色配置

---

### Task 3.3: 实现 _generate_app_entry (新版)
**文件**: `app/core/assembler.py`
**优先级**: P0
**预计时间**: 2h

**规格**:
```python
def _generate_app_entry(self, blueprint: Blueprint) -> str:
    """生成 /App.js 入口文件"""
    # 1. 生成 import 语句 (从 ./components/ 导入)
    # 2. 包含 ErrorBoundary 类定义
    # 3. 包含 LoadingSpinner, ErrorDisplay
    # 4. 生成数据获取逻辑
    # 5. 生成数据提取变量
    # 6. 生成布局和组件渲染
```

**验收标准**:
- [ ] App.js 可独立运行
- [ ] 包含 ErrorBoundary 隔离
- [ ] 正确导入所有组件

---

### Task 3.4: 实现失败组件替代逻辑
**文件**: `app/core/assembler.py`
**优先级**: P0
**预计时间**: 1h

**规格**:
```python
def _generate_error_wrapper(self, spec: ComponentSpec, error: str) -> str:
    """为失败组件生成 ErrorCard 包装文件"""
    return f'''import ErrorCard from './ErrorCard';

export default function {spec.component_name}() {{
  return (
    <ErrorCard 
      title="{spec.component_name} 生成失败"
      error="{error}"
    />
  );
}}
'''
```

**验收标准**:
- [ ] 失败组件使用 ErrorCard 替代
- [ ] 错误信息显示在 UI 中

---

### Task 3.5: 添加预置 ErrorCard 模板
**文件**: `app/core/assembler.py`
**优先级**: P0
**预计时间**: 0.5h

**规格**:
```python
ERROR_CARD_TEMPLATE = '''import { AlertCircle, RefreshCw } from 'lucide-react';

export default function ErrorCard({ title, error }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-red-50 rounded-xl border border-red-200">
      <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
      <h3 className="font-semibold text-red-800 mb-2">{title || '组件生成失败'}</h3>
      <p className="text-red-600 text-sm text-center">{error}</p>
    </div>
  );
}
'''

def _get_error_card_template(self) -> str:
    return ERROR_CARD_TEMPLATE
```

**验收标准**:
- [ ] ErrorCard.jsx 包含在输出文件中

---

## Phase 4: 语法验证

### Task 4.1: 创建 SyntaxValidator 模块
**文件**: `app/core/syntax_validator.py` (新建)
**优先级**: P1
**预计时间**: 2h

**规格**:
```python
class SyntaxValidator:
    """使用 esbuild 验证 JSX 语法"""
    
    def validate(self, code: str) -> tuple[bool, str]:
        """
        Returns:
            (is_valid, error_message)
        """
        # 1. 写入临时文件
        # 2. 调用 npx esbuild --bundle
        # 3. 解析结果
```

**依赖**:
- 需要安装 esbuild: `npm install -g esbuild` 或使用 npx

**验收标准**:
- [ ] 可检测常见语法错误
- [ ] 超时处理 (10s)
- [ ] 返回友好的错误信息

---

### Task 4.2: 集成验证到 Worker 流程
**文件**: `app/core/worker.py`
**优先级**: P1
**预计时间**: 1h

**规格**:
```python
async def generate_component(self, spec: ComponentSpec, ...) -> tuple[str, bool, str]:
    """
    Returns:
        (code, is_success, error_message)
    """
    code = await self._call_llm(...)
    
    # 验证语法
    is_valid, error = self.validator.validate(code)
    if not is_valid:
        return code, False, error
    
    return code, True, ""
```

**验收标准**:
- [ ] 语法错误的组件被标记为失败
- [ ] 错误信息被保留用于显示

---

## Phase 5: Pipeline 集成

### Task 5.1: 更新 Pipeline 执行流程
**文件**: `app/core/pipeline.py`
**优先级**: P0
**预计时间**: 2h

**变更内容**:
```python
async def execute(self, ...) -> PipelineResult:
    # 1. Planner 生成 Blueprint
    blueprint = await self.planner.plan(...)
    
    # 2. Workers 并行生成组件
    results = await self.orchestrator.generate_all(blueprint)
    # results: dict[str, tuple[str, bool, str]]  # id -> (code, success, error)
    
    # 3. 收集成功/失败组件
    component_codes = {}
    failed_components = set()
    for comp_id, (code, success, error) in results.items():
        if success:
            component_codes[comp_id] = code
        else:
            failed_components.add(comp_id)
    
    # 4. Assembler 生成多文件结构
    files = self.assembler.assemble(
        blueprint, component_codes, failed_components
    )
    
    # 5. 构建 MultiFileArtifact
    return PipelineResult(
        artifact=MultiFileArtifact(
            title=blueprint.dashboard_title,
            files=files,
            dependencies=blueprint.dependencies,
            failed_components=list(failed_components),
        ),
        ...
    )
```

**验收标准**:
- [ ] Pipeline 返回 MultiFileArtifact
- [ ] 失败组件正确标记

---

### Task 5.2: 更新 Planner 依赖决策
**文件**: `app/core/planner.py`
**优先级**: P1
**预计时间**: 1h

**变更内容**:
- Planner Prompt 添加依赖决策说明
- 解析 LLM 输出中的 dependencies 字段

**验收标准**:
- [ ] Blueprint 包含动态决定的依赖
- [ ] 使用日期的看板包含 date-fns

---

### Task 5.3: 更新 WorkerOrchestrator
**文件**: `app/core/worker.py`
**优先级**: P0
**预计时间**: 1h

**变更内容**:
```python
async def generate_all(
    self, blueprint: Blueprint
) -> dict[str, tuple[str, bool, str]]:
    """
    并行生成所有组件
    
    Returns:
        { component_id: (code, is_success, error_message) }
    """
```

**验收标准**:
- [ ] 返回每个组件的状态
- [ ] 并行执行正常工作

---

### Task 5.4: 更新 execute_streaming 方法
**文件**: `app/core/pipeline.py`
**优先级**: P0
**预计时间**: 2h

**变更内容**:
- 修改流式输出逻辑
- 使用新的 SSE 事件类型

**验收标准**:
- [ ] 流式输出 artifact_start, artifact_file, artifact_end 事件
- [ ] 每个文件单独发送

---

## Phase 6: SSE 协议更新

### Task 6.1: 定义新事件类型
**文件**: `app/models/stream.py` 或 `app/core/stream_parser.py`
**优先级**: P0
**预计时间**: 1h

**变更内容**:
```python
class EventType(str, Enum):
    THINKING = "thinking"
    MESSAGE = "message"
    ARTIFACT_START = "artifact_start"
    ARTIFACT_FILE = "artifact_file"      # 新增
    ARTIFACT_END = "artifact_end"
```

**验收标准**:
- [ ] EventType 包含 ARTIFACT_FILE

---

### Task 6.2: 实现文件流式输出
**文件**: `app/core/pipeline.py`
**优先级**: P0
**预计时间**: 1h

**规格**:
```python
# 在 execute_streaming 中
yield StreamEvent(
    type=EventType.ARTIFACT_START,
    content=json.dumps({
        "type": "react-multi-file",
        "title": blueprint.dashboard_title,
        "fileCount": len(files),
        "entry": "/App.js",
        "dependencies": blueprint.dependencies,
    })
)

for path, code in files.items():
    status = "failed" if is_failed else "success"
    yield StreamEvent(
        type=EventType.ARTIFACT_FILE,
        content=json.dumps({
            "path": path,
            "code": code,
            "status": status,
        })
    )

yield StreamEvent(type=EventType.ARTIFACT_END, content="{}")
```

**验收标准**:
- [ ] 每个文件单独作为事件发送
- [ ] 文件状态正确标记

---

### Task 6.3: 更新 SSE 格式化
**文件**: `app/api/chat.py`
**优先级**: P0
**预计时间**: 1h

**变更内容**:
确保 SSE 事件正确格式化为 `event: type\ndata: content\n\n` 格式

**验收标准**:
- [ ] 前端可正确解析新事件
- [ ] 向后兼容旧事件类型

---

## 测试任务

### Task T.1: 单元测试 - Assembler
**文件**: `tests/core/test_assembler_multi_file.py` (新建)
**优先级**: P1
**预计时间**: 2h

**测试用例**:
- [ ] 生成正确的文件结构
- [ ] colors.js 格式正确
- [ ] App.js 包含正确的 import
- [ ] 失败组件使用 ErrorCard

---

### Task T.2: 集成测试 - Pipeline
**文件**: `tests/core/test_pipeline_multi_file.py` (新建)
**优先级**: P1
**预计时间**: 2h

**测试用例**:
- [ ] 端到端生成多文件
- [ ] SSE 事件顺序正确
- [ ] 语法验证正常工作

---

## 里程碑

| 里程碑 | 完成标准 | 目标日期 |
|--------|----------|----------|
| M1: 模型就绪 | Phase 1 完成 | Day 1 |
| M2: Worker 多文件输出 | Phase 2 完成 | Day 2 |
| M3: Assembler 多文件组装 | Phase 3 完成 | Day 3 |
| M4: 语法验证集成 | Phase 4 完成 | Day 3 |
| M5: Pipeline 集成 | Phase 5 完成 | Day 4 |
| M6: SSE 协议完成 | Phase 6 完成 | Day 5 |
| M7: 测试通过 | 所有测试通过 | Day 5 |

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| esbuild 不可用 | 语法验证失败 | 降级为简单正则检查 |
| LLM 不遵循新格式 | 生成代码不符合规范 | 添加代码修复后处理 |
| 依赖冲突 | Sandpack 运行失败 | 锁定依赖版本 |

---

## 开始执行

准备好后，从 **Task 1.1** 开始执行。

建议执行顺序: 1.1 → 1.2 → 1.3 → 2.1 → 2.2 → 2.3 → 3.1 → ...
