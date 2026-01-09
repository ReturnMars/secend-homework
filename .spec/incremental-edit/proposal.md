# 对话式增量修改技术方案

> 版本: v1.0 | 日期: 2026-01-07 | 状态: 待讨论

## 1. 背景与目标

### 1.1 当前痛点

用户生成 Dashboard 后，想通过对话修改：
- "把柱状图改成折线图"
- "颜色换成蓝色系"
- "加一个 KPI 卡片"

**当前实现**：每次修改都**全量重新生成**所有组件
- ❌ 慢（5个组件 = 10-15秒）
- ❌ 可能改变用户不想改的部分
- ❌ 无法看到哪些地方变了

### 1.2 目标

- ✅ 只修改需要改的组件（增量更新）
- ✅ 保留用户满意的部分
- ✅ 前端能展示修改了什么
- ✅ 支持版本回滚

---

## 2. 行业调研

### 2.1 Cursor 方案（推荐参考）

**核心：两阶段分离**

```
用户请求 → Planning Model → Apply Model → 输出
           (规划)           (执行)
```

| 阶段 | 模型 | 任务 | 特点 |
|------|------|------|------|
| Planning | GPT-4o / Claude | 理解意图、分析代码、生成修改计划 | 强推理，少 token |
| Applying | 小模型 / 专用模型 | 根据计划生成代码 | 快速，~1000 tokens/秒 |

**Speculative Edits（投机编辑）**：
- 核心洞察：代码修改时，大部分内容不变
- 技术：把原代码喂给模型，只在"不同意"处生成新 token
- 效果：9x 加速

### 2.2 v0.dev 方案

- 增量修改优先，AI 理解上下文
- 用户可以明确说"保留现有代码，只修改 X"
- QuickEdit 模式用于小改动

### 2.3 Bolt.new 方案

- Inspector Tool：点击 UI 元素直接发指令修改
- 持久化上下文（Living Document）
- 版本回滚支持

---

## 3. 技术方案

### 3.1 架构概览

```
                    ┌──────────────────────────────────────┐
                    │           用户请求                   │
                    │      "把销售图表改成折线图"           │
                    └─────────────────┬────────────────────┘
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  阶段1: 意图分析器 (Intent Analyzer)                                        │
│  ─────────────────────────────────────                                      │
│  输入: 用户消息 + 当前 Blueprint + 当前文件                                  │
│  模型: 主模型 (用于推理)                                                     │
│  输出: ModificationIntent                                                   │
│                                                                             │
│  {                                                                          │
│    "type": "single_component",   // 修改类型                                │
│    "target": ["SalesChart"],     // 目标组件                                │
│    "action": "modify",           // modify | add | remove | restyle         │
│    "changes": ["BarChart → LineChart"],                                     │
│    "preserve": ["KpiCards", "TrendChart"]                                   │
│  }                                                                          │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  ▼
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
        ┌───────────────────┐       ┌───────────────────┐
        │ 单组件/样式修改    │       │ 结构性修改         │
        │ (增量执行)         │       │ (重新规划)         │
        └─────────┬─────────┘       └─────────┬─────────┘
                  ▼                           ▼
        ┌───────────────────┐       ┌───────────────────┐
        │ 只重新生成目标组件 │       │ 完整 Pipeline     │
        │ 其他文件保留       │       │ Planner→Workers   │
        │ ~2-3秒            │       │ ~10-15秒          │
        └─────────┬─────────┘       └─────────┬─────────┘
                  │                           │
                  └────────────┬──────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  阶段2: SSE 输出                                                            │
│  ───────────────                                                            │
│  artifact_start: { mode: "incremental", changes: {...} }                    │
│  artifact_file: { path: "...", code: "...", status: "modified" }            │
│  artifact_end                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 修改类型分类

| 类型 | 示例 | 执行策略 | 预计耗时 |
|------|------|----------|----------|
| `single_component` | "把柱状图改成折线图" | 只重新生成 1 个组件 | 2-3s |
| `style` | "颜色换成蓝色系" | 只修改 colors.js | 1-2s |
| `add_component` | "再加一个趋势图" | 生成新组件 + 更新 App.js | 3-5s |
| `remove_component` | "删掉这个图表" | 删除文件 + 更新 App.js | <1s |
| `structural` | "重新设计整个布局" | 完整 Pipeline 重新生成 | 10-15s |

### 3.3 意图分析器设计

```python
class IntentAnalyzer:
    """分析用户修改意图"""
    
    ANALYZE_PROMPT = """
    你是一个 Dashboard 修改意图分析专家。
    
    ## 当前 Dashboard 结构
    {blueprint_json}
    
    ## 用户请求
    {user_message}
    
    ## 任务
    分析用户想要做的修改，返回 JSON：
    
    {
      "type": "single_component" | "style" | "add_component" | "remove_component" | "structural",
      "target_components": ["组件名"],
      "action": "modify" | "add" | "remove" | "restyle",
      "changes": ["具体修改描述"],
      "preserve": ["不需要改动的组件"],
      "confidence": 0.9
    }
    
    如果不确定用户意图，设置 confidence < 0.7，系统会走全量重新生成。
    """
    
    async def analyze(
        self,
        user_message: str,
        current_blueprint: Blueprint,
        history: list[ChatMessage],
    ) -> ModificationIntent:
        # 调用 LLM 分析意图
        ...
```

### 3.4 增量执行器设计

```python
class IncrementalExecutor:
    """增量执行修改"""
    
    async def execute(
        self,
        intent: ModificationIntent,
        current_artifact: MultiFileArtifact,
        current_blueprint: Blueprint,
    ) -> AsyncGenerator[StreamEvent, None]:
        
        if intent.type == "single_component":
            yield from await self._modify_single_component(intent, current_artifact)
            
        elif intent.type == "style":
            yield from await self._modify_style(intent, current_artifact)
            
        elif intent.type == "add_component":
            yield from await self._add_component(intent, current_artifact, current_blueprint)
            
        elif intent.type == "remove_component":
            yield from await self._remove_component(intent, current_artifact)
            
        else:
            # structural: 回退到完整 Pipeline
            yield from await self._full_regeneration(intent, current_blueprint)
    
    async def _modify_single_component(
        self,
        intent: ModificationIntent,
        current_artifact: MultiFileArtifact,
    ):
        component_name = intent.target_components[0]
        component_path = f"/components/{component_name}.jsx"
        
        # 找到当前代码
        current_code = current_artifact.files.get(component_path, "")
        
        # 调用 Worker 生成新代码（带上修改指令）
        new_code = await self.worker.regenerate_with_instruction(
            current_code=current_code,
            instruction=intent.changes[0],
        )
        
        # 构建增量输出
        yield StreamEvent(
            type=EventType.ARTIFACT_START,
            content=json.dumps({
                "mode": "incremental",
                "changes": {
                    "modified": [component_path],
                    "added": [],
                    "removed": [],
                    "unchanged": [p for p in current_artifact.files if p != component_path],
                }
            })
        )
        
        yield StreamEvent(
            type=EventType.ARTIFACT_FILE,
            content=json.dumps({
                "path": component_path,
                "code": new_code,
                "status": "modified",
            })
        )
        
        yield StreamEvent(type=EventType.ARTIFACT_END, content="{}")
```

---

## 4. SSE 协议扩展

### 4.1 新增字段

#### `artifact_start` 扩展

```json
{
  "type": "artifact_start",
  "content": {
    "identifier": "sales-dashboard",
    "title": "销售看板",
    "type": "react-multi-file",
    
    // ===== 新增字段 =====
    "mode": "incremental",     // "full" | "incremental"
    "version": 2,
    "previousVersion": 1,
    "changes": {
      "modified": ["/components/SalesChart.jsx"],
      "added": [],
      "removed": [],
      "unchanged": ["/App.js", "/components/KpiCards.jsx", "/utils/colors.js"]
    }
  }
}
```

#### `artifact_file` 扩展

```json
{
  "type": "artifact_file",
  "content": {
    "path": "/components/SalesChart.jsx",
    "code": "import React from 'react';\n...",
    
    // ===== 新增字段 =====
    "status": "modified",      // "new" | "modified" | "unchanged"
    "diff": {                  // 可选：行级差异
      "additions": 5,
      "deletions": 3,
      "hunks": [
        {
          "startLine": 5,
          "oldContent": "import { BarChart } from 'recharts';",
          "newContent": "import { LineChart } from 'recharts';"
        }
      ]
    }
  }
}
```

### 4.2 前端处理逻辑

```typescript
// 前端状态
interface ArtifactState {
  files: Record<string, string>;
  version: number;
  modifiedFiles: Set<string>;
}

function handleSSE(event: SSEEvent, state: ArtifactState): ArtifactState {
  switch (event.type) {
    case 'artifact_start':
      const data = JSON.parse(event.content);
      
      if (data.mode === 'incremental') {
        // 增量模式：保留 unchanged 文件
        return {
          ...state,
          version: data.version,
          modifiedFiles: new Set(data.changes.modified),
          // 删除 removed 的文件
          files: Object.fromEntries(
            Object.entries(state.files).filter(
              ([path]) => !data.changes.removed.includes(path)
            )
          ),
        };
      } else {
        // 全量模式：清空
        return {
          files: {},
          version: data.version,
          modifiedFiles: new Set(),
        };
      }
      
    case 'artifact_file':
      const file = JSON.parse(event.content);
      return {
        ...state,
        files: {
          ...state.files,
          [file.path]: file.code,
        },
        modifiedFiles: file.status === 'modified' 
          ? state.modifiedFiles.add(file.path)
          : state.modifiedFiles,
      };
      
    case 'artifact_end':
      // 可以触发 Sandpack 刷新
      return state;
  }
}
```

### 4.3 UI 展示建议

```tsx
// 文件列表中标记修改的文件
function FileTab({ path, isModified }) {
  return (
    <div className={isModified ? 'bg-yellow-100' : ''}>
      {path}
      {isModified && <span className="text-yellow-600">●</span>}
    </div>
  );
}

// 可选：Diff 视图
function DiffView({ oldCode, newCode }) {
  return <ReactDiffViewer oldValue={oldCode} newValue={newCode} />;
}
```

---

## 5. 数据模型扩展

### 5.1 ModificationIntent 模型

```python
# app/models/intent.py

from pydantic import BaseModel
from typing import Literal, Optional

class ModificationIntent(BaseModel):
    """修改意图"""
    
    type: Literal[
        "single_component",  # 单组件修改
        "style",             # 样式修改
        "add_component",     # 添加组件
        "remove_component",  # 删除组件
        "structural",        # 结构性修改（需要重新规划）
    ]
    
    target_components: list[str] = []   # 目标组件
    action: Literal["modify", "add", "remove", "restyle"] = "modify"
    changes: list[str] = []             # 具体修改描述
    preserve: list[str] = []            # 保留不变的组件
    confidence: float = 0.9             # 置信度
    
    # 如果置信度低于阈值，回退到全量重新生成
    CONFIDENCE_THRESHOLD = 0.7
    
    def should_use_incremental(self) -> bool:
        return (
            self.confidence >= self.CONFIDENCE_THRESHOLD
            and self.type != "structural"
        )
```

### 5.2 数据库扩展（可选）

```sql
-- 可选：记录修改历史
CREATE TABLE artifact_changes (
    id UUID PRIMARY KEY,
    artifact_id UUID REFERENCES artifacts(id),
    from_version INTEGER,
    to_version INTEGER,
    change_type VARCHAR(50),  -- single_component, style, etc.
    modified_files JSONB,     -- ["/components/SalesChart.jsx"]
    user_instruction TEXT,    -- 用户原始请求
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 6. 实施计划

### Phase 1: 基础设施（1-2天）

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 扩展 SSE 协议 | 添加 mode, changes, status 字段 | P0 |
| 前端适配 | 处理 incremental 模式 | P0 |
| 版本传递 | 修改时获取当前 artifact 版本 | P0 |

### Phase 2: 意图分析器（2-3天）

| 任务 | 说明 | 优先级 |
|------|------|--------|
| IntentAnalyzer 实现 | LLM 判断修改类型 | P0 |
| Prompt 优化 | 提高意图识别准确率 | P0 |
| 置信度回退 | 低置信度时回退全量生成 | P1 |

### Phase 3: 增量执行器（2-3天）

| 任务 | 说明 | 优先级 |
|------|------|--------|
| 单组件修改 | 只重新生成目标组件 | P0 |
| 样式修改 | 只修改 colors.js | P1 |
| 添加/删除组件 | 更新文件结构 | P1 |

### Phase 4: 优化（可选，后续）

| 任务 | 说明 | 优先级 |
|------|------|--------|
| Diff 生成 | 计算行级差异 | P2 |
| 修改历史 | 记录每次修改 | P2 |
| Speculative Edits | 加速代码生成 | P3 |

---

## 7. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 意图识别不准 | 修改错误组件 | 置信度阈值 + 回退机制 |
| 增量修改破坏一致性 | 组件间不协调 | 保守策略：有疑问就全量 |
| 前端状态不同步 | 显示错误 | version 校验，不匹配就全量刷新 |

---

## 8. 决策点（待讨论）

### Q1: 选择哪种策略作为默认？

| 选项 | 优点 | 缺点 |
|------|------|------|
| A. 保守（偏向全量） | 稳定，不会出错 | 慢 |
| B. 激进（偏向增量） | 快，体验好 | 可能出错 |
| C. 智能（根据置信度） | 平衡 | 实现复杂 |

**建议**：C，置信度阈值 0.7

### Q2: 是否需要 Diff 视图？

| 选项 | 工作量 | 用户价值 |
|------|--------|----------|
| A. 不需要，只高亮文件 | 低 | 中 |
| B. 需要行级 Diff | 高 | 高 |

**建议**：先做 A，后续加 B

### Q3: 修改历史是否需要持久化？

| 选项 | 工作量 | 场景 |
|------|--------|------|
| A. 只在前端保留 | 低 | 当前会话回滚 |
| B. 数据库持久化 | 中 | 跨会话历史 |

**建议**：先做 A

---

## 9. 参考资料

- [Cursor Speculative Edits Blog](https://cursor.com/blog/instant-apply)
- [v0.dev Documentation](https://v0.dev/docs)
- [Anthropic Artifacts](https://docs.anthropic.com/artifacts)
