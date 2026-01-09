# UI 知识库集成 - 技术设计

## 一、目录结构

```
backend/
├── app/
│   ├── knowledge/                    # 新增：UI 知识库模块
│   │   ├── __init__.py               # 模块导出
│   │   ├── data/                     # 设计数据（CSV）
│   │   │   ├── styles.csv            # 57 种 UI 风格
│   │   │   ├── colors.csv            # 95 个配色方案
│   │   │   ├── typography.csv        # 56 个字体搭配
│   │   │   ├── charts.csv            # 24 种图表类型
│   │   │   └── ux-guidelines.csv     # 98 条 UX 规则
│   │   ├── loader.py                 # 数据加载器
│   │   ├── search.py                 # BM25 搜索引擎
│   │   └── recommender.py            # 可视化推荐器
│   ├── core/
│   │   ├── schema_analyzer.py        # [已有] Schema 分析
│   │   └── prompt_builder.py         # [修改] 增强 Prompt 构建
│   └── prompts/
│       ├── system.py                 # [修改] 增加设计规范
│       └── data_aware.py             # [修改] 增加可视化建议模板
```

---

## 二、核心数据结构

### 2.1 图表推荐

```python
from dataclasses import dataclass
from typing import Optional

@dataclass
class ChartRecommendation:
    """单个图表推荐"""
    chart_type: str         # "line", "bar", "pie", "scatter", "heatmap"
    title: str              # "月度销售趋势"
    x_field: str            # 映射的 X 轴字段
    y_field: str            # 映射的 Y 轴字段
    group_field: Optional[str]  # 分组字段（可选）
    reason: str             # 推荐理由
    priority: int           # 优先级 (1 最高)
```

### 2.2 配色方案

```python
@dataclass
class ColorPalette:
    """配色方案"""
    name: str               # "Sales Professional"
    industry: str           # "sales"
    primary: str            # "#3B82F6"
    secondary: str          # "#10B981"
    accent: str             # "#F59E0B"
    background: str         # "#F8FAFC"
    surface: str            # "#FFFFFF"
    text: str               # "#1E293B"
    text_muted: str         # "#64748B"
    border: str             # "#E2E8F0"
    success: str            # "#22C55E"
    warning: str            # "#EAB308"
    error: str              # "#EF4444"
    chart_colors: list[str] # ["#3B82F6", "#10B981", "#F59E0B", ...]
```

### 2.3 完整推荐计划

```python
@dataclass
class VisualizationPlan:
    """完整的可视化推荐计划"""
    domain: str                        # 业务领域
    charts: list[ChartRecommendation]  # 推荐图表列表
    color_palette: ColorPalette        # 配色方案
    ui_style: str                      # UI 风格
    layout: str                        # 布局类型
    font_config: dict                  # 字体配置
    spacing_config: dict               # 间距配置
```

---

## 三、推荐规则

### 3.1 领域关键词映射

```python
DOMAIN_KEYWORDS = {
    "sales": {
        "zh": ["销售", "订单", "营收", "客户", "成交", "销量"],
        "en": ["sales", "order", "revenue", "customer", "deal", "amount"],
    },
    "finance": {
        "zh": ["财务", "利润", "成本", "预算", "支出", "收入"],
        "en": ["finance", "profit", "cost", "budget", "expense", "income"],
    },
    "hr": {
        "zh": ["人力", "员工", "薪资", "考勤", "招聘", "离职"],
        "en": ["hr", "employee", "salary", "attendance", "hire", "turnover"],
    },
    "marketing": {
        "zh": ["营销", "转化", "渠道", "活动", "流量", "曝光"],
        "en": ["marketing", "conversion", "channel", "campaign", "traffic", "impression"],
    },
    "operations": {
        "zh": ["运营", "库存", "生产", "物流", "质量"],
        "en": ["operation", "inventory", "production", "logistics", "quality"],
    },
}
```

### 3.2 图表推荐规则

```python
CHART_RULES = [
    {
        "name": "时间趋势",
        "condition": {
            "has_date": True,
            "has_number": True,
        },
        "recommend": "line",
        "priority": 1,
        "reason": "时间序列数据最适合使用折线图展示变化趋势",
    },
    {
        "name": "分类对比",
        "condition": {
            "has_category": True,
            "category_count": {"max": 10},
            "has_number": True,
        },
        "recommend": "bar",
        "priority": 2,
        "reason": "分类数据适合使用柱状图进行对比分析",
    },
    {
        "name": "占比分布",
        "condition": {
            "has_category": True,
            "category_count": {"max": 6},
            "has_number": True,
        },
        "recommend": "pie",
        "priority": 3,
        "reason": "少量分类适合使用饼图展示占比关系",
    },
    {
        "name": "相关分析",
        "condition": {
            "number_fields": {"min": 2},
        },
        "recommend": "scatter",
        "priority": 4,
        "reason": "两个数值字段适合使用散点图分析相关性",
    },
    {
        "name": "多维分析",
        "condition": {
            "has_category": True,
            "category_count": {"min": 2, "max": 20},
            "has_number": True,
        },
        "recommend": "heatmap",
        "priority": 5,
        "reason": "多维度交叉数据适合使用热力图",
    },
]
```

### 3.3 布局推荐规则

```python
LAYOUT_RULES = {
    1: "single",      # 单图
    2: "dual",        # 左右双图
    3: "tri",         # 一大两小
    4: "quad",        # 四宫格
    "many": "dashboard",  # 完整看板
}

def recommend_layout(chart_count: int) -> str:
    if chart_count >= 5:
        return "dashboard"
    return LAYOUT_RULES.get(chart_count, "single")
```

---

## 四、搜索引擎设计

### 4.1 BM25 实现

```python
class BM25:
    """BM25 文本相关性排序算法"""
    
    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.corpus = []
        self.doc_lengths = []
        self.avgdl = 0
        self.idf = {}
        
    def fit(self, documents: list[str]) -> None:
        """构建索引"""
        ...
        
    def score(self, query: str) -> list[tuple[int, float]]:
        """计算查询与每个文档的相关性分数"""
        ...
```

### 4.2 搜索接口

```python
def search(
    query: str,
    domain: str = None,  # "style", "color", "chart", "ux"
    max_results: int = 3,
) -> list[dict]:
    """
    搜索 UI 知识库
    
    Args:
        query: 搜索关键词
        domain: 搜索领域（自动检测如果未指定）
        max_results: 最大返回结果数
        
    Returns:
        匹配结果列表
    """
    ...
```

---

## 五、Prompt 模板设计

### 5.1 可视化建议模板

```python
VISUALIZATION_CONTEXT_TEMPLATE = '''
## 📈 可视化建议

根据数据特征分析，推荐以下图表组合：

{chart_recommendations}

### 字段映射说明
{field_mapping}

---

## 🎨 设计规范

### UI 风格
- **风格**: {ui_style}
- **特点**: {style_description}

### 配色方案
- **主题**: {palette_name}
- **主色调**: {primary_color} (用于主要元素、标题、重点数据)
- **辅助色**: {secondary_color} (用于次要元素、图例)
- **强调色**: {accent_color} (用于 CTA、警示信息)
- **背景色**: {background_color}
- **文字色**: {text_color}
- **图表配色**: {chart_colors}

### 字体配置
- **标题**: {heading_font}, font-weight: 600
- **正文**: {body_font}, font-weight: 400
- **数字**: font-variant-numeric: tabular-nums

### 布局规范
- **间距**: {spacing}
- **圆角**: {border_radius}
- **阴影**: {shadow}

---

## 📐 布局建议

{layout_suggestion}

---

⚠️ **重要**: 请严格遵循以上设计规范生成代码，不要使用其他配色或风格。
'''
```

### 5.2 单个图表推荐模板

```python
CHART_RECOMMENDATION_TEMPLATE = '''
**{index}. {title}** ({chart_type_cn})
- 图表类型: `{chart_type}`
- X 轴字段: `{x_field}`
- Y 轴字段: `{y_field}`{group_field_line}
- 推荐理由: {reason}
'''
```

---

## 六、集成流程

```python
# app/core/prompt_builder.py

class DataAwarePromptBuilder:
    
    async def build(
        self,
        user_message: str,
        session_id: str = None,
        dataset_id: str = None,
    ) -> str:
        # 1. 获取数据集（已有逻辑）
        dataset = await self._resolve_dataset(session_id, dataset_id)
        if not dataset:
            return user_message
            
        # 2. 获取 Schema（已有逻辑）
        schema = dataset.schema_info
        
        # 3. [新增] 生成可视化推荐
        from app.knowledge.recommender import VisualizationRecommender
        recommender = VisualizationRecommender()
        plan = recommender.recommend(
            schema=schema,
            user_message=user_message,
        )
        
        # 4. 构建增强 Prompt
        context = self._build_data_context(dataset, schema)  # 已有
        viz_context = self._build_visualization_context(plan)  # 新增
        
        return f"{user_message}\n\n{context}\n\n{viz_context}"
```

---

## 七、扩展点

### 7.1 用户偏好提取

```python
def extract_user_preferences(message: str) -> dict:
    """
    从用户对话中提取设计偏好
    
    Examples:
        "用深色主题" → {"theme": "dark"}
        "简约风格" → {"style": "minimalism"}
        "金融风格的配色" → {"industry": "finance"}
    """
    preferences = {}
    
    # 主题检测
    if any(kw in message for kw in ["深色", "暗色", "dark"]):
        preferences["theme"] = "dark"
    elif any(kw in message for kw in ["浅色", "亮色", "light"]):
        preferences["theme"] = "light"
        
    # 风格检测
    style_keywords = {
        "minimalism": ["简约", "简洁", "minimal"],
        "glassmorphism": ["玻璃", "毛玻璃", "glass"],
        # ...
    }
    
    # 行业检测
    for industry, keywords in DOMAIN_KEYWORDS.items():
        if any(kw in message for kw in keywords["zh"]):
            preferences["industry"] = industry
            break
            
    return preferences
```

### 7.2 主题切换支持

```python
# 在 Chat API 中检测主题切换意图
async def detect_theme_switch(message: str) -> Optional[str]:
    """
    检测用户是否要切换主题
    
    Returns:
        新的主题名称，或 None（不切换）
    """
    patterns = [
        (r"换成?(.+)主题", 1),
        (r"使用(.+)配色", 1),
        (r"改成(.+)风格", 1),
    ]
    # ...
```

---

## 八、测试策略

### 8.1 单元测试覆盖

| 模块 | 测试文件 | 测试点 |
|------|---------|--------|
| loader | `test_loader.py` | CSV 加载、缓存、索引 |
| search | `test_search.py` | BM25 算法、多领域搜索 |
| recommender | `test_recommender.py` | 领域推断、图表推荐、配色匹配 |

### 8.2 集成测试用例

```python
@pytest.mark.asyncio
async def test_end_to_end_sales_data():
    """端到端测试：销售数据 → 推荐 → Prompt"""
    # 准备销售数据 Schema
    schema = {
        "fields": {
            "date": {"type": "date"},
            "sales": {"type": "number", "min": 0, "max": 10000},
            "region": {"type": "string", "unique_count": 4},
        },
        "row_count": 100,
    }
    
    # 执行推荐
    recommender = VisualizationRecommender()
    plan = recommender.recommend(schema, "帮我分析销售数据")
    
    # 验证
    assert plan.domain == "sales"
    assert any(c.chart_type == "line" for c in plan.charts)
    assert "blue" in plan.color_palette.primary.lower() or plan.color_palette.primary.startswith("#3")
```
