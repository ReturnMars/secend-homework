# 当前任务: UI 精细化与 Lint 错误修复 ✅

## 🎯 目标 (Goal)

完善 ImportPage 的视觉表现，修复组件属性传递错误，并清理全量 Lint 警告以提升代码质量，确保 UI 风格符合原生 Shadcn 规范。

## 🚦 当前进度 (Status)

任务已圆满完成。所有组件已对齐 Shadcn 原生样式，Lint 警告已清零，处理流水线运行稳定。

## 📝 执行计划 (Execution Plan)

- [x] 1. **UI 修复**: 恢复 `ImportPage.tsx` 的功能并修复语法报错。
- [x] 2. **样式精简**: 移除 `RuleConfigPanel` 和 `ProcessingStatus` 的自定义 CSS 覆盖。
- [x] 3. **类型安全**: 修复 `UploadZone.tsx` 和 `ImportPage.tsx` 中的 Props 传递错误。
- [x] 4. **代码清理**: 移除全量未使用变量（如 `onResume`）及更新过时的 CSS 类名。

## 🧠 状态与暂存区 (Scratchpad)

### 🔧 技术决策

- **Shadcn First**: 确立了优先使用 Shadcn 默认属性而非自定义样式类的准则，以增强组件的稳健性和一致性。
- **Tailwind v4 适配**: 将 `break-words` 替换为 `wrap-break-word` 解决了 v4 引擎下的潜在类名警告。

### 📌 关键变更

- **组件重构**: `ProcessingStatus` 移除了 `onResume` 属性，统一使用 `handleAction` 管理后端命令。
- **Props 对齐**: `UploadDropZone` 统一使用 `onFileSelect` 毁调，弃用了已废弃的 `onTriggerFileInput`。

### ⚠️ 经验教训

- 在大规模重构 UI 时，务必先检查 IDE 的 Lint 提示，避免残留无用变量导致构建失败。
- 对于 `DangerouslySetInnerHTML` 中的样式，需格外注意转义字符和 Tailwind JIT 的兼容性。
