# 多文件 Dashboard 架构 - 技术设计

## 1. 架构总览

### 1.1 系统流程图

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
│  输入: 用户需求 + 数据 Schema                                                 │
│  输出: Blueprint (JSON)                                                       │
│    - component_specs: 组件规格列表                                            │
│    - dependencies: 所需依赖列表 (动态)                                        │
│    - global_contract: 颜色、主题配置                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│  Worker A            │ │  Worker B            │ │  Worker C            │
│  /components/Kpi.jsx │ │  /components/Pie.jsx │ │  /components/Bar.jsx │
│                      │ │                      │ │                      │
│  输出: 独立完整文件  │ │  输出: 独立完整文件  │ │  输出: 独立完整文件  │
│  (含 import 语句)    │ │  (含 import 语句)    │ │  (含 import 语句)    │
└──────────────────────┘ └──────────────────────┘ └──────────────────────┘
                    │               │               │
                    │      ┌────────┴────────┐      │
                    │      ▼                 ▼      │
                    │  语法验证 (esbuild)           │
                    │  失败 → ErrorCard.jsx         │
                    │               │               │
                    └───────────────┼───────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       阶段三: Assembler (组装器)                              │
│                                                                               │
│  输入: Blueprint + 组件代码字典                                               │
│  输出: 文件字典                                                               │
│    {                                                                          │
│      "/App.js": "...",                                                        │
│      "/components/Kpi.jsx": "...",                                            │
│      "/components/Pie.jsx": "...",                                            │
│      "/utils/colors.js": "..."                                                │
│    }                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       阶段四: SSE 流式输出                                    │
│                                                                               │
│  event: artifact_start                                                        │
│  data: { type: "react-multi-file", fileCount: 4, dependencies: {...} }       │
│                                                                               │
│  event: artifact_file                                                         │
│  data: { path: "/utils/colors.js", code: "..." }                             │
│                                                                               │
│  event: artifact_file                                                         │
│  data: { path: "/components/Kpi.jsx", code: "..." }                          │
│                                                                               │
│  event: artifact_file                                                         │
│  data: { path: "/App.js", code: "..." }                                      │
│                                                                               │
│  event: artifact_end                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 文件结构设计

### 2.1 生成的文件结构

```
/
├── App.js                    # 主入口 (数据获取 + 布局 + 组件渲染)
├── components/
│   ├── KpiMetricsGrid.jsx    # KPI 卡片组件
│   ├── CostStructurePie.jsx  # 成本结构饼图
│   ├── InventoryChart.jsx    # 库存周转柱状图
│   ├── ProductTimeline.jsx   # 产品生命周期时间轴
│   └── ErrorCard.jsx         # 错误占位组件 (预置)
└── utils/
    └── colors.js             # 颜色常量
```

### 2.2 文件命名规范

| 文件类型 | 命名规则 | 示例 |
|----------|----------|------|
| 主入口 | `App.js` (固定) | `/App.js` |
| 组件文件 | `{PascalCase}.jsx` | `/components/KpiMetricsGrid.jsx` |
| 工具文件 | `{camelCase}.js` | `/utils/colors.js` |
| 错误组件 | `ErrorCard.jsx` (固定) | `/components/ErrorCard.jsx` |

---

## 3. 核心模块设计

### 3.1 Worker 输出格式变化

**之前 (片段代码)**:
```jsx
// 无 import，依赖 Assembler 注入
interface KpiProps { data: KpiItem[]; }

function KpiGrid({ data }: KpiProps) {
  const COLORS = { primary: '#6366F1', ... };  // 重复定义
  return <div>...</div>;
}
```

**之后 (完整独立文件)**:
```jsx
import { TrendingUp, Clock } from 'lucide-react';
import { COLORS } from '../utils/colors';

interface KpiProps {
  data: KpiItem[];
}

interface KpiItem {
  name: string;
  label: string;
  value: number | string;
}

export default function KpiMetricsGrid({ data }: KpiProps) {
  return (
    <div className="bg-white rounded-xl p-6">
      {data.map((item, index) => (
        <div key={index} style={{ color: COLORS.chart[index] }}>
          {item.label}: {item.value}
        </div>
      ))}
    </div>
  );
}
```

### 3.2 Worker Prompt 变化

```python
WORKER_SYSTEM_PROMPT = """You are a React Component File Generator.
Generate a COMPLETE, STANDALONE .jsx file for Sandpack.

## File Structure (MUST FOLLOW):

The file MUST have this exact structure:

1. **Imports** (at the very top)
   - Recharts: import { PieChart as RePieChart, ... } from 'recharts';
   - Icons: import { TrendingUp, ... } from 'lucide-react';
   - Colors: import { COLORS } from '../utils/colors';
   - React (if needed): import { useState } from 'react';

2. **TypeScript Interfaces**
   - Props interface
   - Data item interfaces

3. **Helper Functions** (if needed, inside or outside component)

4. **Main Component** (MUST use `export default`)
   - export default function ComponentName({ data }: Props) { ... }

## Critical Rules:

1. ✅ MUST start with imports
2. ✅ MUST use `export default function`
3. ✅ MUST import COLORS from '../utils/colors'
4. ❌ NO hardcoded color values - use COLORS.primary, COLORS.chart[0], etc.
5. ❌ NO fetching data - receive all data via props

## Example Complete File:

```jsx
import { ResponsiveContainer, PieChart as RePieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { COLORS } from '../utils/colors';

interface CostPieProps {
  data: CostItem[];
}

interface CostItem {
  name: string;
  value: number;
}

export default function CostStructurePie({ data }: CostPieProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <h3 className="font-semibold text-lg mb-4">成本结构</h3>
      <div style={{ height: '300px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <RePieChart>
            <Pie data={data} dataKey="value" cx="50%" cy="50%" innerRadius={60} outerRadius={90}>
              {data.map((_, index) => (
                <Cell key={index} fill={COLORS.chart[index % COLORS.chart.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </RePieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

Output ONLY the file content. No explanations. No markdown blocks.
"""
```

### 3.3 Assembler 新设计

```python
class DashboardAssembler:
    """
    将 Worker 生成的组件代码组装为多文件结构
    """
    
    def assemble(
        self,
        blueprint: Blueprint,
        component_codes: dict[str, str],
        failed_components: set[str],
    ) -> dict[str, str]:
        """
        返回文件字典
        
        Returns:
            {
                "/App.js": "...",
                "/components/KpiGrid.jsx": "...",
                "/utils/colors.js": "...",
            }
        """
        files = {}
        
        # 1. 生成共享颜色文件
        files["/utils/colors.js"] = self._generate_colors_file(blueprint)
        
        # 2. 添加预置的 ErrorCard 组件
        files["/components/ErrorCard.jsx"] = self._get_error_card_template()
        
        # 3. 收集组件文件 (成功的和失败的)
        for spec in blueprint.component_specs:
            file_path = f"/components/{spec.component_name}.jsx"
            
            if spec.id in failed_components:
                # 失败组件使用 ErrorCard 包装
                files[file_path] = self._generate_error_wrapper(spec)
            else:
                # 验证语法后添加
                code = component_codes.get(spec.id, "")
                validated_code = self._validate_and_fix(code)
                files[file_path] = validated_code
        
        # 4. 生成 App.js 入口
        files["/App.js"] = self._generate_app_entry(blueprint)
        
        return files
    
    def _generate_colors_file(self, blueprint: Blueprint) -> str:
        """生成 /utils/colors.js"""
        colors = blueprint.global_contract.colors
        return f'''// Auto-generated color constants
export const COLORS = {{
  primary: '{colors.primary}',
  secondary: '{colors.secondary}',
  success: '{colors.success}',
  warning: '{colors.warning}',
  error: '{colors.error}',
  background: '{colors.background}',
  text: '{colors.text}',
  textMuted: '{colors.text_muted}',
  border: '{colors.border}',
  chart: {json.dumps(colors.chart_colors)},
}};
'''
    
    def _generate_app_entry(self, blueprint: Blueprint) -> str:
        """生成 /App.js 入口文件"""
        # 收集 import 语句
        imports = []
        for spec in blueprint.component_specs:
            imports.append(
                f"import {spec.component_name} from './components/{spec.component_name}';"
            )
        
        # 收集数据提取语句
        data_extractions = []
        component_renders = []
        for spec in blueprint.component_specs:
            var_name = self._to_camel_case(spec.id) + "Data"
            data_extractions.append(
                f"  const {var_name} = {spec.data_slice.access_code};"
            )
            
            # 生成渲染代码
            col_span = spec.layout_position.col_span
            span_style = f' style={{{{ gridColumn: "span {col_span}" }}}}' if col_span > 1 else ""
            component_renders.append(
                f'        <ErrorBoundary><{spec.component_name} data={{{var_name}}}{span_style} /></ErrorBoundary>'
            )
        
        return f'''import React, {{ useState, useEffect }} from 'react';
import {{ AlertCircle, RefreshCw }} from 'lucide-react';
import {{ COLORS }} from './utils/colors';
{chr(10).join(imports)}

// ErrorBoundary for component isolation
class ErrorBoundary extends React.Component {{
  state = {{ hasError: false, error: null }};
  
  static getDerivedStateFromError(error) {{
    return {{ hasError: true, error }};
  }}
  
  render() {{
    if (this.state.hasError) {{
      return (
        <div className="flex items-center justify-center p-4 bg-red-50 rounded-lg border border-red-200">
          <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
          <span className="text-red-600 text-sm">组件加载失败</span>
        </div>
      );
    }}
    return this.props.children;
  }}
}}

// Loading Spinner
function LoadingSpinner() {{
  return (
    <div className="flex items-center justify-center h-screen" style={{{{ backgroundColor: COLORS.background }}}}>
      <RefreshCw className="w-8 h-8 animate-spin" style={{{{ color: COLORS.primary }}}} />
      <span className="ml-2" style={{{{ color: COLORS.textMuted }}}}>加载中...</span>
    </div>
  );
}}

// Error Display
function ErrorDisplay({{ error }}) {{
  return (
    <div className="flex items-center justify-center h-screen" style={{{{ backgroundColor: COLORS.background }}}}>
      <div className="text-center p-8 bg-white rounded-xl shadow-sm">
        <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{{{ color: COLORS.error }}}} />
        <h2 className="text-lg font-bold mb-2">数据加载失败</h2>
        <p className="text-sm text-slate-500">{{error}}</p>
      </div>
    </div>
  );
}}

export default function App() {{
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {{
    fetch("{blueprint.data_source.api_url}")
      .then(res => {{
        if (!res.ok) throw new Error('数据请求失败');
        return res.json();
      }})
      .then(json => {{
        setData(json);
        setLoading(false);
      }})
      .catch(err => {{
        setError(err.message);
        setLoading(false);
      }});
  }}, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorDisplay error={{error}} />;
  if (!data) return <ErrorDisplay error="数据为空" />;

  // Data extraction for each component
  const root = data;
{chr(10).join(data_extractions)}

  return (
    <div className="min-h-screen" style={{{{ backgroundColor: COLORS.background }}}}>
      <div className="bg-white border-b px-6 py-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold" style={{{{ color: COLORS.text }}}}>
            {blueprint.dashboard_title}
          </h1>
          <p className="mt-1 text-sm" style={{{{ color: COLORS.textMuted }}}}>
            {blueprint.dashboard_subtitle or ""}
          </p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid gap-6" style={{{{ gridTemplateColumns: 'repeat({blueprint.layout.columns}, minmax(0, 1fr))' }}}}>
{chr(10).join(component_renders)}
        </div>
      </div>
    </div>
  );
}}
'''
```

### 3.4 语法验证模块

```python
# app/core/syntax_validator.py

import subprocess
import tempfile
import os

class SyntaxValidator:
    """使用 esbuild 验证 JSX 语法"""
    
    def validate(self, code: str, filename: str = "component.jsx") -> tuple[bool, str]:
        """
        验证代码语法
        
        Returns:
            (is_valid, error_message)
        """
        try:
            # 创建临时文件
            with tempfile.NamedTemporaryFile(
                mode='w', 
                suffix='.jsx', 
                delete=False
            ) as f:
                f.write(code)
                temp_path = f.name
            
            # 使用 esbuild 验证 (仅解析，不输出)
            result = subprocess.run(
                ['npx', 'esbuild', temp_path, '--bundle', '--format=esm', '--platform=browser'],
                capture_output=True,
                text=True,
                timeout=10,
            )
            
            os.unlink(temp_path)
            
            if result.returncode == 0:
                return True, ""
            else:
                return False, result.stderr
                
        except subprocess.TimeoutExpired:
            return False, "Validation timeout"
        except Exception as e:
            return False, str(e)
```

---

## 4. SSE 协议设计

### 4.1 新事件类型

| 事件类型 | 描述 | 数据结构 |
|----------|------|----------|
| `artifact_start` | 开始生成多文件 artifact | `{ type, title, fileCount, dependencies }` |
| `artifact_file` | 单个文件内容 | `{ path, code, status }` |
| `artifact_end` | 生成完成 | `{}` |

### 4.2 事件流示例

```
event: thinking
data: 📋 正在规划组件结构...

event: thinking
data: ✅ 规划完成，共 5 个组件

event: thinking
data: 🔨 正在生成组件 1/5: KpiMetricsGrid

event: thinking
data: 🔨 正在生成组件 2/5: CostStructurePie

event: artifact_start
data: {"type":"react-multi-file","title":"研发流程看板","fileCount":6,"entry":"/App.js","dependencies":{"recharts":"^2.12.0","lucide-react":"^0.424.0","date-fns":"^3.6.0"}}

event: artifact_file
data: {"path":"/utils/colors.js","code":"export const COLORS = {...}","status":"success"}

event: artifact_file
data: {"path":"/components/KpiMetricsGrid.jsx","code":"import {...}...","status":"success"}

event: artifact_file
data: {"path":"/components/CostStructurePie.jsx","code":"import {...}...","status":"success"}

event: artifact_file
data: {"path":"/components/FailedComponent.jsx","code":"import ErrorCard...","status":"failed","error":"Generation timeout"}

event: artifact_file
data: {"path":"/App.js","code":"import React...","status":"success"}

event: artifact_end
data: {}

event: message
data: ✨ 看板生成完成！共 5 个组件，其中 1 个生成失败。
```

---

## 5. Blueprint 扩展

### 5.1 新增字段

```python
class Blueprint(BaseModel):
    # ... 现有字段 ...
    
    # 新增: 动态依赖
    dependencies: dict[str, str] = Field(
        default_factory=lambda: {
            "recharts": "^2.12.0",
            "lucide-react": "^0.424.0",
        },
        description="Planner 根据需求决定的依赖列表"
    )
```

### 5.2 Planner Prompt 扩展 (依赖决策)

```python
PLANNER_SYSTEM_PROMPT = """...

## Dependencies Decision

Based on the visualization needs, decide which libraries are required:

**Base dependencies (always included):**
- recharts: for charts
- lucide-react: for icons

**Optional dependencies (include if needed):**
- date-fns: for date formatting
- framer-motion: for animations
- clsx + tailwind-merge: for conditional styling

In your Blueprint output, include:
```json
{
  "dependencies": {
    "recharts": "^2.12.0",
    "lucide-react": "^0.424.0",
    "date-fns": "^3.6.0"  // Only if date formatting is needed
  }
}
```
"""
```

---

## 6. 文件可见性配置

### 6.1 Sandpack 配置

```javascript
// 前端 Sandpack 配置
<Sandpack
  template="react"
  files={artifact.files}
  customSetup={{
    dependencies: artifact.dependencies,
  }}
  options={{
    activeFile: "/App.js",
    visibleFiles: [
      "/App.js",
      ...Object.keys(artifact.files).filter(f => f.startsWith("/components/")),
      // /utils/ 文件隐藏
    ],
    showTabs: true,
    showNavigator: true,
  }}
/>
```

---

## 7. 错误处理设计

### 7.1 ErrorCard 组件模板

```jsx
// /components/ErrorCard.jsx (预置模板)
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function ErrorCard({ title, error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-red-50 rounded-xl border border-red-200">
      <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
      <h3 className="font-semibold text-red-800 mb-2">{title || '组件生成失败'}</h3>
      <p className="text-red-600 text-sm text-center mb-4">{error}</p>
      {onRetry && (
        <button 
          onClick={onRetry}
          className="flex items-center px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          重新生成
        </button>
      )}
    </div>
  );
}
```

### 7.2 失败组件包装

```jsx
// 当组件生成失败时，Assembler 生成的替代文件
import ErrorCard from './ErrorCard';

export default function FailedComponentName() {
  return (
    <ErrorCard 
      title="CostStructurePie 生成失败"
      error="API 请求超时"
    />
  );
}
```

---

## 8. 数据模型更新

### 8.1 PipelineResult

```python
class MultiFileArtifact(BaseModel):
    """多文件 artifact 结构"""
    type: Literal["react-multi-file"] = "react-multi-file"
    title: str
    entry: str = "/App.js"
    files: dict[str, str]                    # path -> code
    file_status: dict[str, str]              # path -> "success" | "failed"
    dependencies: dict[str, str]             # package -> version
    failed_components: list[str] = []        # 失败的组件 ID 列表


class PipelineResult(BaseModel):
    """Pipeline 执行结果"""
    artifact: MultiFileArtifact
    summary: str
    component_count: int
    success_count: int
    failed_count: int
```

---

## 9. 设计决策记录

### 9.1 不需要向后兼容

本次重构为**全新实现**，不保留旧的单文件模式。

- ✅ 所有 artifact 统一使用 `react-multi-file` 类型
- ✅ Pipeline 直接返回 `MultiFileArtifact`
- ✅ 前端同步更新适配新格式

### 9.2 关键设计决策

| 决策 | 选项 | 决定 | 原因 |
|------|------|------|------|
| 文件结构 | 扁平/分类/功能分组 | **分类目录** | 清晰且简单 |
| 共享代码 | 多个/单个 | **仅 colors.js** | 保持简洁 |
| 数据流 | App 分发/组件自取/Context | **App 统一分发** | 简单可控 |
| 错误处理 | 跳过/失败/ErrorCard | **ErrorCard 替代** | 用户可见 |
| 流式输出 | 一次性/按文件 | **按文件流式** | 体验更好 |
| 语法验证 | 无/esbuild | **esbuild 验证** | 提前发现错误 |
