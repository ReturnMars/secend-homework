# Assembler 重构 - 需求规格

## 1. 项目背景

### 1.1 当前问题

`assembler.py` 承担了过多代码生成职责，与项目"AI 规范 → AI 生成 → AI 检查"的理念不符：

| 问题 | 影响 |
|------|------|
| `_generate_app_entry()` 185 行硬编码 JSX | 难以维护，与 AI 生成理念冲突 |
| `templates.py` 5 个组件写在 Python 字符串中 | 无法 lint，难以改进 |
| `_generate_colors_file()` 硬编码 | 应该由 Planner 决定 |
| Assembler 职责过重 | 组装 + 生成混在一起 |

### 1.2 目标

重构 Assembler，使其符合项目理念：

```
Planner (AI 规划) → Workers (AI 生成) → Assembler (仅组装) → Validator (语法校验)
```

**核心原则**：
- **AI 生成一切代码**：App.tsx、基础组件都由 AI 生成
- **Assembler 只做组装**：收集文件、校验语法、输出结果
- **Knowledge 提供参考**：基础组件作为 knowledge 参考实现

---

## 2. 功能需求

### 2.1 核心功能

| ID | 功能 | 优先级 | 描述 |
|----|------|--------|------|
| F-01 | Planner 输出 colors_code | P0 | Blueprint 直接包含完整的 colors.ts 代码 |
| F-02 | App Worker | P0 | 合并阶段让 AI 生成 App.tsx |
| F-03 | 基础组件 Knowledge | P0 | ErrorCard 等作为 knowledge 参考实现 |
| F-04 | Assembler 精简 | P0 | 移除代码生成逻辑，仅保留组装功能 |
| F-05 | Base Component Worker | P1 | 可选：AI 生成基础组件（根据需求） |
| F-06 | 删除 templates.py | P1 | 完全移除硬编码的前端组件 |

### 2.2 用户故事

**US-01: 作为开发者，我希望 Assembler 只负责文件组装**
- 验收标准：Assembler 中不包含 JSX 代码生成逻辑
- 验收标准：所有前端代码都由 AI 或 knowledge 提供

**US-02: 作为开发者，我希望基础组件可以被 AI 参考和改进**
- 验收标准：ErrorCard 等组件在 knowledge 中有参考实现
- 验收标准：AI 可以基于参考生成定制版本

**US-03: 作为开发者，我希望 App.tsx 由 AI 动态生成**
- 验收标准：App.tsx 包含正确的组件导入
- 验收标准：App.tsx 包含正确的数据提取逻辑
- 验收标准：App.tsx 布局符合 Blueprint 规划

---

## 3. 非功能需求

### 3.1 性能
- App Worker 生成时间 < 15s
- 整体 Pipeline 时间增加 < 20%

### 3.2 可靠性
- App.tsx 生成成功率 > 95%
- 语法校验准确率 > 99%

### 3.3 可维护性
- Assembler 代码行数减少 > 50%
- 移除所有硬编码的 JSX 字符串

---

## 4. 约束条件

### 4.1 技术约束
- 保持与现有 SSE 协议兼容
- 保持 MultiFileArtifact 输出格式不变
- 复用现有 Worker 基础设施

### 4.2 业务约束
- 向后兼容：现有 Pipeline 流程不变
- Token 成本：增加的 AI 调用应有上限

---

## 5. 验收标准

### 5.1 P0 功能验收
- [ ] Blueprint 包含 `colors_code` 字段
- [ ] App Worker 能正确生成 App.tsx
- [ ] 基础组件参考实现在 knowledge 中
- [ ] Assembler 中无 JSX 生成代码
- [ ] 端到端测试通过

### 5.2 P1 功能验收
- [ ] `templates.py` 文件删除
- [ ] Base Component Worker 可选启用
- [ ] 现有测试全部通过

