# Assembler 重构 - 任务清单

## 任务概览

| Phase | 任务数 | 预计时间 | 状态 |
|-------|--------|----------|------|
| Phase 1: Blueprint 扩展 | 2 | 1h | ✅ 已完成 |
| Phase 2: Knowledge 基础组件 | 3 | 1.5h | ✅ 已完成 |
| Phase 3: App Worker | 3 | 2h | ✅ 已完成 |
| Phase 4: Assembler 精简 | 2 | 1h | ✅ 已完成 |
| Phase 5: Pipeline 集成 | 2 | 1h | ✅ 已完成 |
| Phase 6: 清理 & 测试 | 3 | 1.5h | ✅ 已完成 |
| **合计** | **15** | **8h** | ✅ **全部完成** |

---

## Phase 1: Blueprint 扩展

### Task 1.1: 扩展 Blueprint 模型
**文件**: `app/models/blueprint.py`
**优先级**: P0

**变更内容**:
```python
class Blueprint(BaseModel):
    # ... 现有字段 ...
    
    # 新增字段
    colors_code: str = Field(
        default="",
        description="Planner 生成的完整 colors.ts 代码"
    )
    
    base_components: list[str] = Field(
        default_factory=lambda: [
            "ErrorCard", "DashboardCard", "ErrorBoundary", "Loading", "ErrorDisplay"
        ],
        description="需要包含的基础 UI 组件"
    )
```

**验收标准**:
- [ ] Blueprint 包含 `colors_code` 字段
- [ ] Blueprint 包含 `base_components` 字段
- [ ] Pydantic 模型验证通过

---

### Task 1.2: 更新 Planner Prompt
**文件**: `app/prompts/planner.py`
**优先级**: P0

**变更内容**:
1. 在 PLANNER_SYSTEM_PROMPT 中添加 colors_code 生成说明
2. 在 Blueprint JSON Schema 中添加新字段示例
3. 更新 build_planner_prompt() 如有需要

**验收标准**:
- [ ] Planner 输出包含完整的 colors_code
- [ ] colors_code 是有效的 TypeScript 代码

---

## Phase 2: Knowledge 基础组件

### Task 2.1: 创建基础组件目录
**文件**: `app/knowledge/data/components/`
**优先级**: P0

**步骤**:
1. 创建目录 `app/knowledge/data/components/`
2. 将 `templates.py` 中的组件移到此目录
3. 文件列表:
   - `ErrorCard.tsx`
   - `DashboardCard.tsx`
   - `ErrorBoundary.tsx`
   - `Loading.tsx`
   - `ErrorDisplay.tsx`

**验收标准**:
- [ ] 5 个组件文件创建完成
- [ ] 每个文件是有效的 TSX 代码

---

### Task 2.2: 实现组件加载器
**文件**: `app/knowledge/component_loader.py` (新建)
**优先级**: P0

**内容**:
```python
def load_base_component(name: str) -> str
def load_all_base_components(names: list[str]) -> dict[str, str]
def get_base_components_prompt(names: list[str]) -> str
```

**验收标准**:
- [ ] 能正确加载单个组件
- [ ] 能批量加载多个组件
- [ ] 能生成用于 prompt 的组件参考

---

### Task 2.3: 更新 Knowledge __init__.py
**文件**: `app/knowledge/__init__.py`
**优先级**: P1

**变更内容**:
- 导出 `load_base_component`, `load_all_base_components`, `get_base_components_prompt`

**验收标准**:
- [ ] 可从 `app.knowledge` 直接导入

---

## Phase 3: App Worker

### Task 3.1: 创建 App Worker Prompt
**文件**: `app/prompts/app_worker.py` (新建)
**优先级**: P0

**内容**:
```python
APP_WORKER_SYSTEM_PROMPT = """..."""
APP_WORKER_USER_PROMPT_TEMPLATE = """..."""

def build_app_worker_prompt(
    blueprint: Blueprint,
    success_components: list[ComponentSpec],
    base_components_prompt: str,
) -> str
```

**验收标准**:
- [ ] System prompt 清晰描述 App.tsx 结构
- [ ] User prompt 包含所有必要信息
- [ ] 包含布局、数据提取、组件导入说明

---

### Task 3.2: 实现 AppWorker 类
**文件**: `app/core/app_worker.py` (新建)
**优先级**: P0

**内容**:
```python
@dataclass
class AppWorkerResult:
    code: str
    success: bool
    error: Optional[str] = None

class AppWorker:
    async def generate_app(self, blueprint: Blueprint) -> AppWorkerResult:
        """
        并行友好：只需要 Blueprint，不需要等待其他 Worker 结果。
        自带语法校验，校验通过才返回 success=True。
        """
```

**关键特性**:
- ⭐ **不依赖 component_results** - 只需要 Blueprint 中的组件规格
- ⭐ **自带语法校验** - 使用 tsx_validator 校验
- ⭐ **自动重试** - 校验失败自动重试 (最多 2 次)

**验收标准**:
- [ ] 能调用 LLM 生成 App.tsx
- [ ] 返回 AppWorkerResult (code, success, error)
- [ ] 包含 tsx_validator 语法校验
- [ ] 校验失败时自动重试
- [ ] 可与 Business Workers 并行执行

---

### Task 3.3: App Worker 单元测试
**文件**: `tests/core/test_app_worker.py` (新建)
**优先级**: P1

**测试用例**:
- [ ] 测试 prompt 构建
- [ ] 测试代码清洗
- [ ] 测试（mock）LLM 调用

---

## Phase 4: Assembler 精简

### Task 4.1: 重构 DashboardAssembler
**文件**: `app/core/assembler.py`
**优先级**: P0

**变更内容**:
1. 删除 `_generate_colors_file()` - 使用 `blueprint.colors_code`
2. 删除 `_generate_app_entry()` - 使用 `app_result` 参数
3. 删除 `_clean_component_code()` - 校验已在 Worker 完成
4. 更新 `assemble()` 签名：`app_result: AppWorkerResult`
5. 添加基础组件加载逻辑
6. 添加 `_generate_fallback_app()` - App Worker 失败时的 fallback

**新签名**:
```python
def assemble(
    self,
    blueprint: Blueprint,
    component_results: dict[str, ComponentResult],
    app_result: AppWorkerResult,  # 已校验
) -> MultiFileArtifact
```

**验收标准**:
- [ ] assemble() 接受 `app_result: AppWorkerResult`
- [ ] 不再生成代码，只组装文件
- [ ] 不再做语法校验（已在 Worker 完成）
- [ ] 代码行数减少 > 50%

---

### Task 4.2: 更新 assemble_dashboard 便捷函数
**文件**: `app/core/assembler.py`
**优先级**: P0

**变更内容**:
```python
from app.core.app_worker import AppWorkerResult

def assemble_dashboard(
    blueprint: Blueprint,
    component_results: dict[str, ComponentResult],
    app_result: AppWorkerResult,  # 新增参数
) -> MultiFileArtifact
```

**验收标准**:
- [ ] 签名更新完成
- [ ] 导入 AppWorkerResult
- [ ] 文档字符串更新

---

## Phase 5: Pipeline 集成

### Task 5.1: 更新 PipelineExecutor (并行执行)
**文件**: `app/core/pipeline.py`
**优先级**: P0

**变更内容**:
1. 添加 `self.app_worker = AppWorker()`
2. 使用 `asyncio.gather()` 并行执行 Business Workers + App Worker
3. 更新 `assembler.assemble()` 调用，传入 `app_result`

**关键代码**:
```python
# 并行执行所有 Workers
business_task = asyncio.create_task(self._collect_business_results(blueprint))
app_task = asyncio.create_task(self.app_worker.generate_app(blueprint))

component_results, app_result = await asyncio.gather(business_task, app_task)

# 组装
artifact = self.assembler.assemble(blueprint, component_results, app_result)
```

**验收标准**:
- [ ] App Worker 与 Business Workers 并行执行
- [ ] 总时间 ≈ max(所有 Worker 时间)，而非 sum
- [ ] 流式输出包含所有 Worker 进度
- [ ] 端到端流程正常

---

### Task 5.2: 更新 execute() 非流式方法
**文件**: `app/core/pipeline.py`
**优先级**: P1

**变更内容**:
- 同步更新 `execute()` 方法，添加 App Worker 调用

**验收标准**:
- [ ] 非流式 Pipeline 正常工作

---

## Phase 6: 清理 & 测试

### Task 6.1: 删除 templates.py
**文件**: `app/core/templates.py`
**优先级**: P1

**步骤**:
1. 确认所有组件已迁移到 knowledge
2. 删除文件
3. 更新 assembler.py 的 import

**验收标准**:
- [ ] 文件已删除
- [ ] 无引用错误

---

### Task 6.2: 更新现有测试
**文件**: `tests/core/test_assembler*.py`, `tests/core/test_pipeline*.py`
**优先级**: P0

**变更内容**:
- 更新 Assembler 测试，传入 app_code
- 更新 Pipeline 测试，验证 App Worker 流程

**验收标准**:
- [ ] 所有现有测试通过
- [ ] 测试覆盖新流程

---

### Task 6.3: 端到端集成测试
**文件**: `tests/api/test_assembler_refactor.py` (新建)
**优先级**: P1

**测试用例**:
- [ ] 完整 Pipeline 生成多文件 Dashboard
- [ ] 验证 colors.ts 来自 Planner
- [ ] 验证 App.tsx 来自 App Worker
- [ ] 验证基础组件来自 knowledge

---

## 快速命令

```bash
# 运行单元测试
uv run pytest tests/core/test_app_worker.py -v

# 运行 Assembler 测试
uv run pytest tests/core/test_assembler*.py -v

# 运行 Pipeline 测试
uv run pytest tests/core/test_pipeline*.py -v

# 运行所有相关测试
uv run pytest tests/ -k "assembler or app_worker or pipeline" -v

# 启动开发服务器测试
uv run uvicorn app.main:app --reload --port 8000
```

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| App Worker 生成质量不稳定 | App.tsx 语法错误 | 添加语法校验和重试 |
| Planner 不生成 colors_code | 缺少颜色文件 | 添加默认 fallback |
| Token 成本增加 | 费用上升 | 监控 token 使用，优化 prompt |

---

## 实施顺序

```
Day 1 (4h):
├── Task 1.1: Blueprint 扩展
├── Task 1.2: Planner Prompt
├── Task 2.1: 基础组件目录
└── Task 2.2: 组件加载器

Day 2 (4h):
├── Task 3.1: App Worker Prompt
├── Task 3.2: AppWorker 实现
├── Task 4.1: Assembler 重构
├── Task 4.2: 便捷函数更新
└── Task 5.1: Pipeline 集成

Day 3 (2h):
├── Task 6.1: 删除 templates.py
├── Task 6.2: 更新测试
└── Task 6.3: 端到端测试
```

---

## 开始执行

准备好后，从 **Task 1.1** 开始执行。

建议执行顺序: 1.1 → 1.2 → 2.1 → 2.2 → 3.1 → 3.2 → 4.1 → 5.1 → 6.1 → 6.2 → 6.3

