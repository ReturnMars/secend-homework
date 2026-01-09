# Nexus AI 智能体指南 (Nexus AI Agent Guide)

本仓库使用 `.spec` 文件夹来维护 AI Agent 的不同"上下文层"。

## 📂 `.spec` 目录结构 (The `.spec` Directory Structure)

`.spec` 文件夹是项目需求、设计和进度的**唯一真实来源 (Single Source of Truth)**。在进行任何更改之前，请务必查阅这些文件。

- `tasks.md`: **项目路线图与状态 (Project Roadmap & Status)**.
  - 查看此文件以确认下一步工作内容（寻找第一个未勾选的 `[ ]` 项目）。
  - 仅在满足验证标准后将任务标记为 `[x]`。
  
- `design.md`: **系统架构与技术规范 (System Architecture & Technical Specifications)**.
  - 包含数据库模式、API 契约和架构决策。
  - 如果您提议进行重大的架构更改，请先更新此文件。
  
- `tech-stack-notes.md`: **技术约束与最佳实践 (Technology Constraints & Best Practices)**.
  - 包含已确认使用的库（例如 "使用 uv"，"LangChain v1.0"）。
  - 在未检查此文件或询问用户之前，**请勿**引入新库。

- `requirements.md`: **产品需求 (Product Requirements)**.
  - 高层级的用户故事和功能定义。

## 🤖 交互协议 (Interaction Protocol)

1. **先读 (Read-First)**: 编写代码前，阅读 `.spec/tasks.md` 以确认当前活动任务。
2. **上下文感知 (Context-Aware)**: 根据 `tech-stack-notes.md` 中的规定，使用 `uv` 进行依赖管理。
3. **后更新 (Update-Last)**: 完成任务后：
   - 运行验证测试。
   - 更新 `tasks.md` 以反映进度。
   - 如果架构细节发生变化，更新 `design.md`。

## 🕵️ 深度访谈协议 (Deep Interview Protocol)

**触发机制**: 当处理中大型需求、复杂 Bug、架构重构，或用户明确指令（如"开启访谈"）时，**必须启用**此模式。

*注：对于简单的文案修改或显然的小 Bug，默认不启用。*

### 1. 访谈原则 (The Interviewer Persona)

在此模式下，暂停编码，转换为**深度探究模式**：

- **深度提问**: 拒绝显而易见的问题。挖掘 "为什么" 和 "如果不这样做会怎样"。
- **全维覆盖**:
  - **技术角度**: 架构合理性、性能瓶颈、依赖风险、代码可维护性。
  - **产品角度**: UI/UX 细节、用户预期、操作流程、异常反馈 (Error Handling)。
  - **权衡 (Trade-offs)**: 明确告知 "方案 A 响应快但有数据一致性风险，方案 B 稳健但开发成本高"，询问抉择。
- **挑战假设**: "如果数据量扩大 100 倍，当前设计是否会失效？"、"这里是否过度设计了？"

### 2. 闭环落地 (Output Standards)

访谈结束后，结论**必须**落实到 `.spec` 文档中，严禁仅停留在对话历史，这定义了"访谈完全结束"的状态：

1. **目录结构**: 为特定需求创建一个新文件夹 `.spec/[demand_name]/`，例如 `.spec/feature-login/`。
2. **Requirements**: 创建 `.spec/[demand_name]/requirements.md`，明确 User Stories 和验收标准。
3. **Design**: 创建 `.spec/[demand_name]/design.md`，记录架构决策、API 定义及核心流程。
4. **Tasks**: 创建 `.spec/[demand_name]/tasks.md`，将确定的方案拆解为 Checklist。

---

## 🚀 关键命令 (Key Commands)

```bash
uv sync          # 同步环境 (Sync environment)
uv run pytest    # 运行测试 (Run tests)
uv run dev # 启动服务 (Start server) 默认用户开启
```
