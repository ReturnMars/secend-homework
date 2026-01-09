# UI 知识库集成需求规格

## 一、项目背景

### 当前问题
- AI 生成的 BI 看板视觉效果不可控
- 每次生成风格不一致
- 缺乏专业的设计规范指导

### 解决方案
集成 UI 知识库（基于 ui-ux-pro-max-skill），通过规则驱动的推荐系统，让 AI 按照专业设计规范生成可视化组件。

---

## 二、功能需求

### FR-1: UI 知识库
- **FR-1.1**: 复用 ui-ux-pro-max 的设计数据（CSV 格式）
  - 57 种 UI 风格 (`styles.csv`)
  - 95 个配色方案 (`colors.csv`)
  - 56 个字体搭配 (`typography.csv`)
  - 24 种图表类型 (`charts.csv`)
  - 98 条 UX 规则 (`ux-guidelines.csv`)
- **FR-1.2**: 支持 BM25 语义搜索
- **FR-1.3**: 支持按领域/类型过滤

### FR-2: 可视化推荐器
- **FR-2.1**: 根据数据 Schema 推荐图表类型
  - 时间序列 + 数值 → 折线图
  - 分类 + 数值 → 柱状图
  - 少量分类 (≤6) → 饼图
  - 双数值 → 散点图
- **FR-2.2**: 领域推断
  - 优先级 1: 用户上传时指定的领域
  - 优先级 2: 数据中包含的领域字段
  - 优先级 3: 根据字段名关键词推断
- **FR-2.3**: 配色方案匹配
  - 根据领域自动匹配
  - 支持用户通过对话切换

### FR-3: Prompt 增强
- **FR-3.1**: 注入可视化建议（图表类型 + 字段映射）
- **FR-3.2**: 注入设计规范（配色 + 字体 + 间距）
- **FR-3.3**: 注入布局建议（单图/双图/四宫格）

### FR-4: 主题切换
- **FR-4.1**: 用户可通过对话切换主题/配色
  - "换成深色主题"
  - "用金融风格的配色"
- **FR-4.2**: 保持会话内主题一致性

---

## 三、非功能需求

### NFR-1: 性能
- 推荐逻辑响应时间 < 50ms
- 知识库搜索时间 < 100ms

### NFR-2: 可扩展性
- 知识库数据可独立更新
- 推荐规则可配置

### NFR-3: 可测试性
- 推荐逻辑覆盖单元测试
- 搜索功能覆盖单元测试

---

## 四、数据流程

```
用户上传数据
    │
    ▼
SchemaAnalyzer (已完成)
    │ 输出: DatasetSchema
    ▼
VisualizationRecommender (新增)
    │ ├── 领域推断 (domain)
    │ ├── 图表推荐 (charts)
    │ ├── 配色匹配 (color_palette)
    │ └── 布局建议 (layout)
    │ 输出: VisualizationPlan
    ▼
DataAwarePromptBuilder (增强)
    │ ├── 数据上下文 (已有)
    │ ├── 可视化建议 (新增)
    │ └── 设计规范 (新增)
    │ 输出: Enhanced Prompt
    ▼
LLM 生成
    │ 输出: React 代码
    ▼
Sandpack 渲染
```

---

## 五、验收标准

### AC-1: 知识库集成
- [ ] 所有 CSV 文件成功加载
- [ ] BM25 搜索返回相关结果

### AC-2: 图表推荐
- [ ] 时间序列数据推荐折线图
- [ ] 分类数据推荐柱状图
- [ ] 推荐结果包含字段映射

### AC-3: 配色匹配
- [ ] 销售数据自动匹配销售配色
- [ ] 财务数据自动匹配财务配色
- [ ] 用户可通过对话切换

### AC-4: 生成质量
- [ ] 生成的代码使用推荐的配色
- [ ] 生成的图表类型符合推荐
- [ ] 视觉风格一致性提升

---

## 六、接口设计

### 6.1 VisualizationPlan 数据结构
```python
@dataclass
class ChartRecommendation:
    chart_type: str         # line, bar, pie, scatter...
    title: str              # "月度销售趋势"
    x_field: str            # "date"
    y_field: str            # "sales"
    group_field: str | None # 可选分组字段
    reason: str             # 推荐理由

@dataclass
class ColorPalette:
    name: str               # "Sales Blue"
    primary: str            # "#3B82F6"
    secondary: str          # "#10B981"
    accent: str             # "#F59E0B"
    background: str         # "#F8FAFC"
    text: str               # "#1E293B"
    chart_colors: list[str] # 图表多色

@dataclass
class VisualizationPlan:
    domain: str                        # "sales", "finance", "hr"
    charts: list[ChartRecommendation]  # 推荐的图表列表
    color_palette: ColorPalette        # 配色方案
    ui_style: str                      # "Minimalism", "Glassmorphism"
    layout: str                        # "single", "dual", "quad", "dashboard"
    font: dict                         # 字体配置
    spacing: dict                      # 间距配置
```

### 6.2 API 接口
```
# 无需新增 HTTP 端点
# VisualizationRecommender 作为内部服务在 PromptBuilder 中调用
```
