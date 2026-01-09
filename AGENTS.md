# Nexus AI Agent Guide

This repository uses a `.spec` folder to maintain distinct "Context Layers" for AI Agents.

## 📂 The `.spec` Directory Structure

The `.spec` folder is the **Single Source of Truth** for project requirements, design, and progress. Always consult these files before making changes.

- `tasks.md`: **Project Roadmap & Status**.
  - Check this file to see what to work on next (look for the first unchecked `[ ]` item).
  - Mark tasks as `[x]` ONLY after verification standards are met.
  
- `design.md`: **System Architecture & Technical Specifications**.
  - Contains database schemas, API contracts, and architectural decisions.
  - If you propose a major architectural change, update this file first.
  
- `tech-stack-notes.md`: **Technology Constraints & Best Practices**.
  - Contains confirmed libraries (e.g., "Use uv," "LangChain v1.0").
  - **Do not** introduce new libraries without checking this file or asking the user.

- `requirements.md`: **Product Requirements**.
  - High-level user stories and feature definitions.

## 🤖 Interaction Protocol

1. **Read-First**: Before writing code, read `.spec/tasks.md` to identify the active task.
2. **Context-Aware**: Use `uv` for dependency management as specified in `tech-stack-notes.md`.
3. **Update-Last**: After completing a task:
   - Run verification tests.
   - Update `tasks.md` to reflect progress.
   - If architectural details changed, update `design.md`.

## 🕵️ Deep Interview Protocol

**Trigger Mechanism**: Must be enabled when dealing with medium-to-large requirements, complex bugs, architectural refactoring, or explicit user instructions (e.g., "Start interview").

*Note: Not enabled by default for simple text changes or obvious minor bugs.*

### 1. The Interviewer Persona

In this mode, pause coding and switch to **Deep Exploration Mode**:

- **Deep Questioning**: Reject obvious questions. Dig into "Why" and "What implies if not doing so".
- **Full-dimension Coverage**:
  - **Technical**: Architectural sanity, performance bottlenecks, dependency risks, maintainability.
  - **Product**: UI/UX details, user expectations, workflows, error handling.
  - **Trade-offs**: Clearly state "Plan A is fast but risks consistency, Plan B is robust but costly," and ask for a decision.
- **Challenge Assumptions**: "If data volume scales 100x, will this design fail?", "Is this over-engineered?"

### 2. Output Standards

After the interview, conclusions **MUST** be solidified into the `.spec` documents. Do not leave them just in chat history. This defines the "Interview Complete" state:

1. **Folder Structure**: Create a new folder `.spec/[demand_name]/` for the specific demand.
2. **Requirements**: Create `.spec/[demand_name]/requirements.md` with clear User Stories and Acceptance Criteria.
3. **Design**: Create `.spec/[demand_name]/design.md` with architectural decisions, API definitions, and core flows.
4. **Tasks**: Create `.spec/[demand_name]/tasks.md`, breaking down the solution into a Checklist.

---

## 🚀 Key Commands (from tech-stack-notes.md)

```bash
uv sync          # Sync environment
uv run pytest    # Run tests
uv run dev --reload # Start server 默认用户开启
```

---

## 🎯 AI Prompt Constraints System

本项目使用分层的 **Prompt 约束架构** 来确保所有 AI 代理生成一致、无错误的代码。

### 架构概览

```
app/prompts/
├── __init__.py       # 统一导出入口
├── shared.py         # 🔑 公共约束中心 (Single Source of Truth)
├── planner.py        # Planner AI 提示词 (Blueprint 生成)
├── worker.py         # Worker AI 提示词 (Component 生成)
├── system.py         # 直接对话模式提示词
└── data_aware.py     # 数据上下文构建器
```

### 共享约束内容 (`shared.py`)

| 常量 | 用途 |
|-----|------|
| `RECHARTS_ALIAS_MAP` | Recharts 组件强制别名映射 (e.g., `PieChart` → `RePieChart`) |
| `LUCIDE_COMMON_ICONS` | 常用 Lucide 图标列表 |
| `SYNTAX_RULES` | **禁用的 TypeScript 语法模式** (防止运行时崩溃) |
| `NAMING_RULES` | **命名规范与冲突避免规则** |
| `RECHARTS_RULES` | Recharts 使用最佳实践 |
| `OUTPUT_RULES` | 输出格式要求 |
| `WORKER_CONSTRAINTS` | Worker 专用约束组合 |
| `PLANNER_CONSTRAINTS` | Planner 专用约束组合 |

### 使用方式

```python
# 在其他模块中导入共享约束
from app.prompts import SYNTAX_RULES, RECHARTS_ALIAS_MAP, WORKER_CONSTRAINTS

# 或通过包导入
from app.prompts.shared import get_shared_constraints
constraints = get_shared_constraints(include_recharts=True)
```

### 关键规则速查

**禁用的 TypeScript 语法** (会导致 SyntaxError):
- `x as Type` - 类型断言
- `x as keyof typeof obj` - 高级类型转换
- `: value is Type` - 类型谓词
- `readonly prop` - 只读修饰符
- `interface Foo extends Bar` - 接口继承

**Recharts 命名冲突**:
- 必须使用 `RePieChart`, `ReBarChart` 等别名
- 因为 `lucide-react` 和 `recharts` 都导出 `PieChart` 等图标

**命名安全**:
- Worker 生成的代码会被合并到单个文件
- 所有顶层定义必须使用 `ComponentId_` 前缀
- 常量和辅助函数应定义在组件内部

---

## 🔧 Assembler 代码清洗

`app/core/assembler.py` 负责最终代码合并，包含以下防护措施：

1. **导入冲突解决**: 自动移除 `RECHARTS_ALIAS_MAP` 中的原始名称
2. **语法清洗**: 自动移除 `as keyof typeof` 和 `: value is Type` 模式
3. **Markdown 清理**: 移除 `\`\`\`tsx` 代码块标记
4. **Think 标签清理**: 移除 `<think>` 推理块
