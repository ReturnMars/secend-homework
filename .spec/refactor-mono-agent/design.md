# 🔄 架构重构计划：迭代式单体流 (Iterative Mono-Agent Flow)

## 一、重构目标

将现有的 **Planner → Workers → Assembler** 流水线架构，重构为 **Super Coder + Self-Correction Loop** 单体架构。

### 核心理念

```
少管人，多管事
不要管理"谁来做"，而是管理"做出来的东西对不对"
```

### 预期收益

| 指标 | 当前 | 重构后 |
|------|------|--------|
| 代码一致性 | ❌ 组件间变量可能冲突 | ✅ 同一 Agent 保证一致 |
| 错误率 | ❌ AI Reviewer 不可靠 | ✅ 机械校验 100% 可靠 |
| 上下文 | ❌ 碎片化 | ✅ 完整保留 |
| 维护成本 | ❌ 复杂 Agent 通信 | ✅ 单循环逻辑 |
| 代码行数 | ~800 行 (planner+worker+reviewer) | ~300 行 (coder) |

---

## 二、模块清单

### 2.1 保留的模块 ✅

| 模块 | 路径 | 用途 |
|------|------|------|
| `schema_analyzer.py` | `core/` | 分析数据结构，生成 Schema |
| `library_apis.py` | `knowledge/` | API 白名单，防止幻觉导入 |
| `knowledge/` 目录 | `app/knowledge/` | RAG 知识库：组件模板、UI 规范 |
| `tsx_validator.py` | `core/` | TSX 语法校验 |
| `code_validator.py` | `core/` | 代码校验（部分重用） |
| `stream_parser.py` | `core/` | SSE 事件解析 |
| `llm/client.py` | `core/llm/` | LLM 调用客户端 |
| `prompts/shared.py` | `prompts/` | 共享约束规则 |

### 2.2 删除的模块 ❌

| 模块 | 路径 | 原因 |
|------|------|------|
| `planner.py` | `core/` | 合并到 Super Coder prompt |
| `worker.py` | `core/` | 合并到 Super Coder |
| `reviewer.py` | `core/` | 用机械校验替代 |
| `prompts/planner.py` | `prompts/` | 不再需要 |
| `prompts/worker.py` | `prompts/` | 不再需要 |
| `prompts/reviewer.py` | `prompts/` | 不再需要 |

### 2.3 重写的模块 🔄

| 模块 | 路径 | 变化 |
|------|------|------|
| `pipeline.py` | `core/` | 完全重写为 `coder.py` |
| `assembler.py` | `core/` | 简化，只做文件打包 |
| `prompts/system.py` | `prompts/` | 重写为 Super Coder prompt |

### 2.4 新增的模块 ➕

| 模块 | 路径 | 用途 |
|------|------|------|
| `coder.py` | `core/` | Super Coder + Self-Correction Loop |
| `prompts/coder.py` | `prompts/` | Super Coder prompt 模板 |
| `static_linter.py` | `core/` | 统一的机械校验层 |

---

## 三、新架构设计

### 3.1 数据流

```
用户请求 + 数据集
       ↓
┌─────────────────────────────────────────────────────┐
│  Phase 1: Context Building                          │
│  • schema_analyzer → DatasetSchema                  │
│  • knowledge/ RAG → UI 规范、组件模板               │
│  • library_apis → API 白名单                        │
└─────────────────────────────────────────────────────┘
       ↓ Mega Context
┌─────────────────────────────────────────────────────┐
│  Phase 2: Super Coder (分步生成)                    │
│                                                     │
│  Step 1: Generate <plan>                            │
│    → 列出需要创建的文件                              │
│                                                     │
│  Step 2-N: Generate each <file>                     │
│    → 每个文件 + 即时校验 + 可选修正                  │
│                                                     │
│  历史累积：后续文件能看到之前的代码                  │
└─────────────────────────────────────────────────────┘
       ↓ 文件集合
┌─────────────────────────────────────────────────────┐
│  Phase 3: Final Assembly                            │
│  • 简化版 assembler → MultiFileArtifact             │
│  • 最终校验（可选）                                  │
└─────────────────────────────────────────────────────┘
       ↓
       SSE Stream → 前端 Sandpack
```

### 3.2 Self-Correction Loop

```python
# 伪代码
MAX_RETRIES = 3
history = [SystemMessage(super_coder_prompt), HumanMessage(user_context)]

# Step 1: Plan
plan_response = await llm.ainvoke(history)
history.append(AIMessage(plan_response))
files_to_create = parse_plan(plan_response)

# Step 2-N: Generate each file
for file_path in files_to_create:
    history.append(HumanMessage(f"Now generate: {file_path}"))
    
    for attempt in range(MAX_RETRIES):
        file_content = await llm.ainvoke(history)
        
        # 机械校验
        errors = static_linter.validate(file_content)
        
        if not errors:
            history.append(AIMessage(file_content))
            files[file_path] = file_content
            break
        else:
            # 追加错误，让 AI 修正
            history.append(AIMessage(file_content))
            history.append(HumanMessage(f"Validation failed:\n{errors}\nFix it."))
    else:
        # 超过重试，标记失败
        files[file_path] = generate_error_placeholder(file_path, errors)
```

### 3.3 机械校验层 (Static Linter)

```python
class StaticLinter:
    """机械化代码校验，比 AI Reviewer 100% 可靠"""
    
    def validate(self, code: str, file_path: str) -> list[str]:
        errors = []
        
        # 1. 语法检查
        if self._has_ts_casting(code):
            errors.append("❌ 禁止使用 `as` 类型断言")
        
        # 2. 导入白名单
        invalid_imports = self._check_imports(code)
        errors.extend(invalid_imports)
        
        # 3. 必要结构
        if "export default" not in code:
            errors.append("❌ 缺少 export default")
        
        # 4. 括号平衡
        if not self._check_brackets(code):
            errors.append("❌ 括号/花括号不平衡")
        
        # 5. 文件特定检查
        if "/App.tsx" in file_path:
            if "fetch(" not in code:
                errors.append("❌ App.tsx 必须包含数据获取逻辑")
        
        return errors
```

---

## 四、实施步骤

### Phase 1: 基础设施 (不影响现有功能)

- [x] 4.1 创建 `core/static_linter.py` - 机械校验层 ✅
- [x] 4.2 创建 `prompts/coder.py` - Super Coder prompt ✅
- [x] 4.3 创建 `core/coder.py` - Super Coder 核心逻辑 ✅

### Phase 2: 集成 (新旧并存)

- [x] 4.4 在 `config.py` 添加 `USE_SUPER_CODER` 开关 ✅
- [x] 4.5 在 `api/chat.py` 添加双模式支持 ✅
- [ ] 4.6 测试验证新流程
- [ ] 4.7 修复问题

### Phase 3: 切换 (新代替旧)

- [x] 4.8 设置 `USE_SUPER_CODER=True` 为默认 ✅
- [ ] 4.9 验证稳定后删除废弃模块
- [ ] 4.10 更新文档

---

## 五、Prompt 设计

### 5.1 Super Coder System Prompt

```markdown
# React Dashboard Generator

You are an expert React developer. Generate production-ready dashboards.

## Output Protocol

### Step 1: Plan
Analyze the data and output a plan:

<plan>
Dashboard: [Title]
Files:
1. /utils/colors.ts - Color constants
2. /components/[Name].tsx - [Description]
3. /App.tsx - Main entry with data fetching
</plan>

### Step 2-N: Generate Files
When asked to generate a file, output:

<file path="/utils/colors.ts">
// Complete file content here
export const COLORS = { ... }
</file>

## Rules (CRITICAL)

### Forbidden Patterns
- ❌ `x as Type` - TypeScript casting
- ❌ `as keyof typeof` - Advanced TS
- ❌ `import { Defs } from 'recharts'` - Doesn't exist

### Required Patterns
- ✅ Use `RePieChart`, `ReBarChart` aliases for recharts
- ✅ Wrap charts in `<ResponsiveContainer>`
- ✅ Each file must have `export default`

## Available APIs
{LIBRARY_APIS_PROMPT}
```

### 5.2 User Context Prompt

```markdown
## Task
{user_message}

## Dataset: {dataset_name}
API: {api_url}

## Data Schema
{schema_description}

## Data Sample
```json
{data_sample}
```

## Begin
First, output your <plan>. Then I will ask you to generate each file one by one.
```

---

## 六、风险与回滚

### 风险

| 风险 | 缓解措施 |
|------|---------|
| 新流程不稳定 | 保留 `use_new_coder` 开关，可随时回滚 |
| 大型 Dashboard 超 token | 分文件生成天然解决 |
| 模型能力不足 | 优先用 Claude 3.5 Sonnet / GPT-4o |

### 回滚计划

1. 在 `api/chat.py` 设置 `use_new_coder = False`
2. 恢复使用 `pipeline.py`
3. 无需删除任何代码

---

## 七、验收标准

- [ ] 生成的代码无语法错误
- [ ] 导入全部来自白名单
- [ ] 组件间变量/接口一致
- [ ] 单次请求 RTT < 30s (7个组件)
- [ ] 错误重试成功率 > 80%
