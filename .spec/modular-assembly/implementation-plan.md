# 模块化组装架构实施计划 (Modular Assembly Architecture)

## 1. 项目目标

解决当前单一 AI 生成复杂看板时代码过长、容易出错的问题。通过"规划-分治-组装"的三阶段流程，将复杂任务拆解为多个专注的子任务，提升代码质量和可维护性。

---

## 2. 核心架构设计

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              用户请求                                         │
│  "请根据这份产品数据生成一个研发流程看板"                                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         阶段一: Planner (规划器)                              │
│                                                                               │
│  输入: 用户需求 + 数据 Schema + UI 知识库                                     │
│  输出: Blueprint (JSON)                                                       │
│    - global_contract: 全局 TS 类型定义 + 颜色配置 + 主题                       │
│    - component_specs: 每个组件的详细说明书                                     │
│    - layout_config: 栅格布局配置                                              │
│    - data_slices: 每个组件需要的数据片段                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│  Worker A: KPICard   │ │  Worker B: BarChart  │ │  Worker C: PieChart │
│                      │ │                      │ │                     │
│  输入:               │ │  输入:               │ │  输入:              │
│  - component_spec    │ │  - component_spec    │ │  - component_spec   │
│  - data_slice        │ │  - data_slice        │ │  - data_slice       │
│  - ts_interface      │ │  - ts_interface      │ │  - ts_interface     │
│                      │ │                      │ │                     │
│  输出:               │ │  输出:               │ │  输出:              │
│  - 纯展示组件代码    │ │  - 纯展示组件代码    │ │  - 纯展示组件代码   │
│    (无 fetch 逻辑)   │ │    (无 fetch 逻辑)   │ │    (无 fetch 逻辑)  │
└──────────────────────┘ └──────────────────────┘ └──────────────────────┘
                    │               │               │
                    └───────────────┼───────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       阶段三: Assembler (组装器)                              │
│                                                                               │
│  输入:                                                                        │
│    - global_contract                                                          │
│    - 所有 Worker 生成的组件代码                                               │
│    - layout_config                                                            │
│    - 真实数据 API URL                                                         │
│                                                                               │
│  输出: 完整的 Dashboard 单文件                                                │
│    - 合并所有组件到同一文件                                                   │
│    - 生成 App 容器 (包含 fetch + state + 布局)                                │
│    - 统一 import 声明                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Planner 详细设计

### 3.1 Planner 的输入

```python
PlannerInput = {
    "user_message": str,           # 用户原始需求
    "data_schema": DatasetSchema,  # 数据 Schema (来自 schema_analyzer)
    "data_sample": list[dict],     # 数据样本 (3-5 行)
    "ui_knowledge": {              # 来自知识库的推荐
        "domain": str,             # sales/finance/hr/...
        "color_palette": ColorPalette,
        "ui_style": str,           # glassmorphism/minimalism/...
    }
}
```

### 3.2 Planner 的输出: Blueprint

```typescript
// Blueprint 结构定义
interface Blueprint {
  // --- 全局契约 ---
  global_contract: {
    // TS 类型定义 (作为所有 Worker 的"协议")
    type_definitions: string;  // e.g., "interface KPIData { label: string; value: number | string; unit?: string; }"
    
    // 全局颜色常量
    colors: {
      primary: string;
      secondary: string;
      success: string;
      warning: string;
      error: string;
      chart: string[];      // 图表调色盘
      background: string;
      text: string;
    };
    
    // 全局样式 Token
    theme: {
      borderRadius: string;
      shadow: string;
      fontFamily: string;
    };
  };
  
  // --- 组件说明书列表 ---
  component_specs: ComponentSpec[];
  
  // --- 布局配置 ---
  layout: {
    type: "grid" | "flex";
    columns: number;          // e.g., 2
    gap: string;              // e.g., "16px"
    areas: LayoutArea[];      // 哪个组件放在哪个位置
  };
  
  // --- 数据获取配置 ---
  data_source: {
    api_url: string;
    access_path: string;      // e.g., "json.modules"
    loading_state: boolean;
    error_handling: boolean;
  };
}

interface ComponentSpec {
  id: string;                    // e.g., "cost-structure-pie"
  component_name: string;        // e.g., "CostStructureChart"
  component_type: "kpi_card" | "bar_chart" | "pie_chart" | "line_chart" | "composed_chart" | "timeline" | "info_card";
  
  // Props 接口定义 (TS)
  props_interface: string;       // e.g., "interface CostStructureChartProps { data: CostItem[]; }"
  
  // 数据切片 (告诉 Worker 这个组件的数据样本)
  data_slice: {
    source_path: string;         // e.g., "modules[2].data.find(d => d.name === 'cost_structure')"
    sample: any;                 // 实际的数据样本 (3-5 条)
  };
  
  // 可视化规范
  visual_spec: {
    title: string;
    chart_type?: string;         // pie/bar/line/composed
    x_field?: string;
    y_field?: string;
    group_field?: string;
    height?: string;
  };
  
  // 知识库参考 (告诉 Worker 要遵循哪些规则)
  knowledge_refs: string[];      // e.g., ["recharts_naming_alias", "cell_pattern"]
  
  // 布局位置
  layout_position: {
    row: number;
    col: number;
    span?: number;
  };
}

interface LayoutArea {
  component_id: string;
  grid_area: string;             // e.g., "1 / 1 / 2 / 2"
}
```

### 3.3 Planner 的实现逻辑

```python
# app/core/planner.py

class DashboardPlanner:
    """
    负责分析数据结构，生成 Blueprint。
    这是纯逻辑代码，不调用 LLM。
    """
    
    def plan(
        self,
        schema: DatasetSchema,
        data_sample: list[dict],
        user_message: str,
        viz_plan: VisualizationPlan,
    ) -> Blueprint:
        """
        生成 Blueprint。
        
        核心逻辑:
        1. 遍历 data_sample 中的 modules
        2. 根据 module_type 映射到 ComponentSpec
        3. 为每个 ComponentSpec 生成 TS 接口定义
        4. 计算布局位置
        """
        pass
```

### 3.4 关键问题: 如何"拆解得够细"?

根据您的 `test.json` 结构，我们可以识别出以下模块类型:

| module_type | 对应组件类型 | 子组件数量 |
|-------------|-------------|-----------|
| `product_info_card` | BrandInfoCard | 1 |
| `product_spec` | ProductSpecCard + LifecycleTimeline | 2 |
| `data_overview` | 多个图表 (KPI, Pie, Bar, Line, Composed) | 10+ |

对于 `data_overview` 这种"超级模块"，Planner 需要进一步拆解:

```python
# 拆解 data_overview 的逻辑
def _split_data_overview(self, module_data: list[dict]) -> list[ComponentSpec]:
    specs = []
    for item in module_data:
        if item.get("show_type") == "card":
            # 转换为 KPI 卡片组
            specs.append(self._create_kpi_spec(item))
        elif item.get("show_type") == "echart":
            # 根据 chart_type 创建对应的图表 Spec
            chart_type = item["value"]["metrics"][0].get("chart_type", "bar")
            specs.append(self._create_chart_spec(item, chart_type))
    return specs
```

---

## 4. Worker 详细设计

### 4.1 Worker 的 Prompt 模板

```python
WORKER_SYSTEM_PROMPT = """You are a React Component Specialist. 
Your ONLY job is to write a single, self-contained React function component.

## Rules (CRITICAL):
1. **Props-Only Data**: All data MUST come from props. NEVER hardcode data.
2. **No Fetch**: NEVER use `fetch`, `useEffect` for data loading, or any side effects.
3. **Type Compliance**: You MUST use the provided TypeScript interface EXACTLY.
4. **Naming Convention**: Use `RePieChart`, `ReBarChart` aliases for Recharts to avoid conflicts.

## Output Format:
Return ONLY the component code, no explanation, no markdown.
"""

WORKER_USER_PROMPT_TEMPLATE = """
## Component Specification

**Name**: {component_name}
**Type**: {component_type}

### TypeScript Interface (MUST USE):
```typescript
{props_interface}
```

### Data Sample (for reference only, DO NOT hardcode):
```json
{data_sample}
```

### Visual Requirements:
- Title: {title}
- Chart Type: {chart_type}
- X-Axis Field: {x_field}
- Y-Axis Field: {y_field}
- Height: {height}

### Color Palette:
- Primary: {primary_color}
- Chart Colors: {chart_colors}

### Knowledge Rules:
{knowledge_rules}

Now, generate the component code.
"""
```

### 4.2 Worker 输出示例

```tsx
// Worker 生成的 CostStructureChart.tsx (纯展示组件)

interface CostItem {
  name: string;
  label: string;
  value: number;
}

interface CostStructureChartProps {
  data: CostItem[];
}

export function CostStructureChart({ data }: CostStructureChartProps) {
  const COLORS = ['#2563eb', '#7c3aed', '#10b981', '#f59e0b'];
  
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
      <h3 className="font-semibold text-lg text-slate-800 mb-4">成本结构</h3>
      <ResponsiveContainer width="100%" height={256}>
        <RePieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </RePieChart>
      </ResponsiveContainer>
    </div>
  );
}
```

---

## 5. Assembler 详细设计

### 5.1 Assembler 的输入

```python
AssemblerInput = {
    "blueprint": Blueprint,
    "component_codes": dict[str, str],  # { component_id: code_string }
}
```

### 5.2 Assembler 的逻辑

Assembler 可以是 **纯代码逻辑**（非 AI），也可以是一个简化的 AI 调用。

```python
# app/core/assembler.py

class DashboardAssembler:
    """
    将 Worker 生成的组件代码合并为最终的单文件 Dashboard。
    """
    
    def assemble(
        self,
        blueprint: Blueprint,
        component_codes: dict[str, str],
    ) -> str:
        """
        生成最终的 Dashboard 代码。
        
        步骤:
        1. 生成 import 声明
        2. 生成全局常量 (COLORS, THEME)
        3. 合并所有组件代码
        4. 生成 App 容器 (fetch + layout)
        """
        imports = self._generate_imports(blueprint, component_codes)
        constants = self._generate_constants(blueprint.global_contract)
        app_component = self._generate_app_container(blueprint)
        
        # 合并
        final_code = f"""
{imports}

{constants}

{self._combine_components(component_codes)}

{app_component}
"""
        return final_code
    
    def _generate_app_container(self, blueprint: Blueprint) -> str:
        """生成 App 容器，包含 fetch 和布局"""
        return f'''
export default function App() {{
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {{
    fetch("{blueprint.data_source.api_url}")
      .then(res => res.json())
      .then(json => {{
        const extracted = {blueprint.data_source.access_path};
        setData(extracted);
        setLoading(false);
      }})
      .catch(err => {{
        setError(err.message);
        setLoading(false);
      }});
  }}, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay error={{error}} />;

  // 数据分发
  const modules = data?.modules || [];
  const brandInfo = modules.find(m => m.module_type === 'product_info_card');
  const costData = modules.find(m => m.module_type === 'data_overview')
    ?.data?.find(d => d.name === 'cost_structure')?.value?.metrics?.[0]?.items || [];

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto grid grid-cols-{blueprint.layout.columns} gap-{blueprint.layout.gap}">
        {/* 组件渲染 */}
        <BrandInfoCard data={{brandInfo?.data || []}} />
        <CostStructureChart data={{costData}} />
        ...
      </div>
    </div>
  );
}}
'''
```

---

## 6. 实现路径

### Phase 1: 基础设施 (预计 1-2 天)

1.  **创建 `app/core/planner.py`**:
    *   实现 `DashboardPlanner` 类
    *   实现数据结构识别逻辑（根据 `module_type` 和 `show_type`）
    *   实现 TypeScript 接口生成逻辑

2.  **创建 `app/core/assembler.py`**:
    *   实现纯代码的组装逻辑
    *   实现 import 合并和去重

3.  **创建 `app/models/blueprint.py`**:
    *   定义 `Blueprint`, `ComponentSpec` 等 Pydantic 模型

### Phase 2: Worker 调度 (预计 2-3 天)

1.  **创建 `app/core/worker.py`**:
    *   实现 Worker Prompt 模板
    *   实现并行调用逻辑 (使用 `asyncio.gather`)

2.  **修改 `app/api/chat.py`**:
    *   检测是否需要触发"模块化组装"模式
    *   新增编排逻辑

### Phase 3: 流式输出适配 (预计 1-2 天)

1.  **修改 `app/core/stream_parser.py`**:
    *   支持分阶段流式输出（"正在规划..."，"正在生成组件 1/5..."）

2.  **前端适配**:
    *   支持显示生成进度

---

## 7. 关键技术决策

| 决策点 | 选项 A | 选项 B | 推荐 |
|--------|--------|--------|------|
| Planner 是否调用 AI? | 纯代码 (规则驱动) | AI 调用 | **纯代码** (更稳定、更快) |
| Worker 并行还是串行? | 并行 (`asyncio.gather`) | 串行 | **并行** (速度提升 N 倍) |
| Assembler 是否调用 AI? | 纯代码 | AI 调用 (处理复杂依赖) | **纯代码** (先实现，再迭代) |
| 组件如何传递数据? | 全部通过 Props | 部分使用 Context | **Props** (更解耦) |

---

## 8. 下一步行动

### ✅ 已完成

1.  [x] 确认此实施计划
2.  [x] 创建 `app/models/blueprint.py` - Blueprint 数据模型
3.  [x] 创建 `app/core/planner.py` - AI 驱动的规划器
4.  [x] 编写单元测试验证 Planner 输出
5.  [x] 创建 Worker Prompt 模板并测试 (`app/prompts/worker.py`)
6.  [x] 创建 `app/core/worker.py` - 并行组件生成器
7.  [x] 创建 `app/core/assembler.py` - 代码组装器
8.  [x] 创建 `app/core/pipeline.py` - Pipeline 执行器
9.  [x] 集成到 Chat API (`app/api/chat.py`)
10. [x] 添加 `use_pipeline` 参数支持

### 📁 新增文件

| 文件 | 说明 |
|------|------|
| `app/models/blueprint.py` | Blueprint 数据模型定义 |
| `app/prompts/planner.py` | Planner 的 Prompt 模板 |
| `app/prompts/worker.py` | Worker 的 Prompt 模板 |
| `app/core/planner.py` | AI 驱动的 Dashboard 规划器 |
| `app/core/worker.py` | 并行组件生成器和编排器 |
| `app/core/assembler.py` | 代码合并和最终组装 |
| `app/core/pipeline.py` | Pipeline 执行器（流式输出） |
| `tests/core/test_planner.py` | Planner 单元测试 |
| `tests/api/test_chat_pipeline.py` | Chat API Pipeline 集成测试 |
| `scripts/test_pipeline.py` | 端到端 Pipeline 测试脚本 |

### 🔄 修改文件

| 文件 | 修改内容 |
|------|----------|
| `app/models/chat.py` | 添加 `use_pipeline` 字段 |
| `app/api/chat.py` | 集成模块化 Pipeline |
| `app/knowledge/recommender.py` | 被 Planner 使用获取配色 |

### 🚀 使用方法

1. **自动模式**：当检测到"看板"、"dashboard"等关键词且有数据集时，自动启用 Pipeline
2. **显式模式**：在 ChatRequest 中设置 `use_pipeline: true` 强制启用

```json
{
  "messages": [{"role": "user", "content": "生成产品看板"}],
  "dataset_id": "xxx-xxx-xxx",
  "use_pipeline": true
}
```

### 📋 待办事项

1. [ ] 前端适配：显示 Pipeline 进度
2. [ ] 添加更多组件类型支持
3. [ ] 优化 Worker Prompt 以提高代码质量
4. [ ] 添加组件代码验证逻辑
5. [ ] 支持更多图表库（ECharts 等）

