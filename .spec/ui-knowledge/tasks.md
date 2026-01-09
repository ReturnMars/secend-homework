# UI 知识库集成 - 任务清单

## 任务概览

| 阶段 | 任务数 | 状态 | 说明 |
|------|--------|------|------|
| **Phase 1: 知识库复制** | 2 | ✅ 已完成 | 复制 ui-ux-pro-max 数据到项目 |
| **Phase 2: 搜索引擎** | 2 | ✅ 已完成 | 实现 BM25 搜索 |
| **Phase 3: 推荐器** | 4 | ✅ 已完成 | 实现可视化推荐逻辑 |
| **Phase 4: Prompt 集成** | 2 | ✅ 已完成 | 增强 Prompt 构建 |
| **Phase 5: 测试** | 2 | ✅ 已完成 | 单元测试和集成测试 |

---

## Phase 1: 知识库复制

### TASK-UK-001: 创建知识库目录结构
**目标**: 将 ui-ux-pro-max 的数据完整复制到项目中

**源目录**: `docs/ui-ux-pro-max-skill/.shared/ui-ux-pro-max/data/`
**目标目录**: `app/knowledge/data/`

- [x] 创建 `app/knowledge/__init__.py`
- [x] 创建 `app/knowledge/data/` 目录
- [x] 复制主数据文件:
  - `styles.csv` (57 种 UI 风格, 42KB)
  - `colors.csv` (95 个配色方案, 13KB)
  - `typography.csv` (56 个字体搭配, 32KB)
  - `charts.csv` (24 种图表类型, 8KB)
  - `ux-guidelines.csv` (98 条 UX 规则, 19KB)
  - `products.csv` (产品类型推荐, 30KB)
  - `prompts.csv` (AI Prompt 关键词, 17KB)
  - `landing.csv` (落地页模式, 14KB)
- [x] 创建 `app/knowledge/data/stacks/` 目录
- [x] 复制技术栈指南文件:
  - `react.csv` (13KB) ← **当前默认使用**
  - `nextjs.csv` (13KB)
  - `vue.csv` (11KB)
  - `svelte.csv` (11KB)
  - `html-tailwind.csv` (11KB)
  - `react-native.csv` (10KB)
  - `flutter.csv` (10KB)
  - `swiftui.csv` (11KB)
  - `nuxt-ui.csv` (14KB)

**配置**:
```python
# app/knowledge/config.py
DEFAULT_STACK = "react"  # 当前固定使用 React
```

**验收标准**:
```python
from app.knowledge import load_styles, load_colors, load_stack_guidelines

assert len(load_styles()) == 57
assert len(load_colors()) == 95
assert len(load_stack_guidelines("react")) > 0
```

---

### TASK-UK-002: 数据加载器
**目标**: 实现 CSV 数据加载和索引

**文件**: `app/knowledge/loader.py`

- [x] 实现 `load_csv(filename: str) -> list[dict]`
- [x] 实现懒加载 + 缓存（全局单例）
- [x] 实现按领域/类型的索引
- [x] 添加日志记录加载状态

**验收标准**:
```python
from app.knowledge.loader import KnowledgeBase

kb = KnowledgeBase()
colors = kb.get_colors_by_industry("sales")
assert len(colors) > 0
```

---

## Phase 2: 搜索引擎

### TASK-UK-003: BM25 搜索实现
**目标**: 实现 BM25 语义搜索（简化版）

**文件**: `app/knowledge/search.py`

- [x] 实现 `BM25` 类（参考 ui-ux-pro-max 的 core.py）
- [x] 实现 `search(query: str, domain: str, max_results: int) -> list[dict]`
- [x] 支持多领域搜索（style, color, chart, ux）
- [x] 支持 auto-detect domain

**验收标准**:
```python
from app.knowledge.search import search

results = search("glassmorphism modern", domain="style", max_results=3)
assert len(results) <= 3
assert "Glassmorphism" in results[0]["Style Category"]
```

---

### TASK-UK-004: BI 专用搜索优化
**目标**: 为 BI 场景定制搜索

**文件**: `app/knowledge/search.py`

- [x] 添加 `search_chart_type(data_pattern: str) -> list[dict]`
- [x] 添加 `search_color_palette(industry: str) -> ColorPalette`
- [x] 添加 BI 相关关键词扩展

**验收标准**:
```python
from app.knowledge.search import search_chart_type

charts = search_chart_type("time series trend")
assert charts[0]["Best Chart Type"] == "Line Chart"
```

---

## Phase 3: 推荐器

### TASK-UK-005: 领域推断器
**目标**: 根据数据推断业务领域

**文件**: `app/knowledge/recommender.py`

- [x] 实现 `infer_domain(schema: DatasetSchema, user_hint: str = None) -> str`
- [x] 定义领域关键词映射表:
  - sales: 销售, 订单, 营收, revenue, order, sales
  - finance: 财务, 利润, 成本, profit, cost, expense
  - hr: 人力, 员工, 薪资, employee, salary, headcount
  - marketing: 营销, 转化, 渠道, campaign, conversion, channel
- [x] 优先级逻辑:
  1. 用户显式指定
  2. 数据标注
  3. 字段名推断

**验收标准**:
```python
from app.knowledge.recommender import infer_domain

# 根据字段名推断
domain = infer_domain(schema_with_sales_field)
assert domain == "sales"

# 用户指定优先
domain = infer_domain(schema, user_hint="财务分析")
assert domain == "finance"
```

---

### TASK-UK-006: 图表推荐器
**目标**: 根据字段类型推荐图表

**文件**: `app/knowledge/recommender.py`

- [x] 实现 `recommend_charts(schema: DatasetSchema) -> list[ChartRecommendation]`
- [x] 定义推荐规则:
  - date + number → 折线图
  - category(≤10) + number → 柱状图
  - category(≤6) → 饼图
  - number + number → 散点图
  - 多维度 → 热力图
- [x] 包含字段映射: x_field, y_field, group_field
- [x] 生成推荐理由

**验收标准**:
```python
from app.knowledge.recommender import recommend_charts

charts = recommend_charts(schema_with_date_and_sales)
assert charts[0].chart_type == "line"
assert charts[0].x_field == "date"
assert charts[0].y_field == "sales"
```

---

### TASK-UK-007: 配色匹配器
**目标**: 根据领域匹配配色方案

**文件**: `app/knowledge/recommender.py`

- [x] 实现 `get_color_palette(domain: str, style: str = None) -> ColorPalette`
- [x] 从 `colors.csv` 加载对应领域的配色
- [x] 生成 Tailwind 兼容的颜色配置
- [x] 支持用户自定义覆盖

**验收标准**:
```python
from app.knowledge.recommender import get_color_palette

palette = get_color_palette("sales")
assert palette.primary.startswith("#")
assert len(palette.chart_colors) >= 5
```

---

### TASK-UK-008: 综合推荐器
**目标**: 整合所有推荐逻辑

**文件**: `app/knowledge/recommender.py`

- [x] 实现 `VisualizationRecommender` 类
- [x] 实现 `recommend(schema, user_message) -> VisualizationPlan`
- [x] 整合: 领域推断 + 图表推荐 + 配色匹配 + 布局建议
- [x] 支持从用户对话提取偏好（主题、风格）

**验收标准**:
```python
from app.knowledge.recommender import VisualizationRecommender

recommender = VisualizationRecommender()
plan = recommender.recommend(schema, "帮我生成一个销售看板")

assert plan.domain == "sales"
assert len(plan.charts) > 0
assert plan.color_palette is not None
```

---

## Phase 4: Prompt 集成

### TASK-UK-009: 增强 PromptBuilder
**目标**: 将推荐结果注入 Prompt

**文件**: `app/core/prompt_builder.py`, `app/prompts/data_aware.py`

- [ ] 创建 `VISUALIZATION_CONTEXT_TEMPLATE`:
  ```markdown
  ## 📈 可视化建议
  根据数据特征，推荐以下图表组合：
  {chart_recommendations}
  
  ## 🎨 设计规范
  - UI 风格: {ui_style}
  - 主色调: {primary_color}
  - ...
  ```
- [x] 创建 `VISUALIZATION_CONTEXT_TEMPLATE`
- [x] 在 `DataAwarePromptBuilder.build()` 中调用 `VisualizationRecommender`
- [x] 组合数据上下文 + 可视化建议 + 设计规范

**验收标准**:
```python
prompt = builder.build(user_message, session_id, dataset_id)
assert "📈 可视化建议" in prompt
assert "🎨 设计规范" in prompt
```

---

### TASK-UK-010: 更新 System Prompt
**目标**: 添加设计规范遵循规则

**文件**: `app/prompts/system.py`

- [x] 添加 "可视化规范遵循" 规则:
  - 必须使用指定的图表类型
  - 必须使用指定的配色
  - 必须遵循布局建议
- [x] 添加 "设计质量检查清单"
- [x] 添加数据可视化最佳实践

**验收标准**: 代码审查确认规则清晰

---

## Phase 5: 测试

### TASK-UK-011: 单元测试
**目标**: 测试核心模块

**文件**: `tests/knowledge/`

- [x] `test_loader.py` - 数据加载测试
- [x] `test_search.py` - BM25 搜索测试
- [x] `test_recommender.py` - 推荐器测试

**验收标准**: 所有测试通过

---

### TASK-UK-012: 集成测试
**目标**: 端到端测试

**文件**: `tests/knowledge/test_integration.py`

- [x] 测试: 上传数据 → 推荐 → Prompt 生成
- [x] 测试: 不同领域数据的推荐准确性
- [x] 测试: 用户对话切换主题

**验收标准**: 所有测试通过

---

## 快速命令

```bash
# 运行知识库相关测试
uv run pytest tests/knowledge/ -v

# 测试搜索功能
uv run python -c "from app.knowledge.search import search; print(search('glassmorphism'))"

# 测试推荐器
uv run python -c "from app.knowledge.recommender import VisualizationRecommender; ..."
```

---

## 依赖关系

```
TASK-UK-001 (知识库目录)
    ↓
TASK-UK-002 (数据加载器)
    ↓
TASK-UK-003 (BM25 搜索) ─→ TASK-UK-004 (BI 专用搜索)
    ↓
TASK-UK-005 (领域推断) 
TASK-UK-006 (图表推荐)  ─→ TASK-UK-008 (综合推荐器)
TASK-UK-007 (配色匹配)
    ↓
TASK-UK-009 (Prompt 集成) + TASK-UK-010 (System Prompt)
    ↓
TASK-UK-011 (单元测试) + TASK-UK-012 (集成测试)
```

---

## 时间估算

| 阶段 | 任务 | 估算 |
|------|------|------|
| Phase 1 | 知识库复制 | 30 分钟 |
| Phase 2 | 搜索引擎 | 1 小时 |
| Phase 3 | 推荐器 | 2-3 小时 |
| Phase 4 | Prompt 集成 | 1 小时 |
| Phase 5 | 测试 | 1 小时 |
| **合计** | | **5-6 小时** |
