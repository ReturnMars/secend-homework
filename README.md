# DataCleaner Pro - 高级数据清洗与审计管理系统

DataCleaner Pro 是一款基于 Go 和 React 构建的企业级数据处理平台。它专门用于处理大规模 CSV/Excel 数据上传，提供实时的清洗状态反馈、细粒度的记录修改历史（Audit Trail）以及健壮的数据回滚机制。

## 🚀 核心特性

-   **高效异步上传**：支持大文件 CSV/Excel 上传，后端采用异步流式处理，并在前端通过进度条实时同步状态。
-   **智能数据验证**：自动检测数据合法性（Status: Clean/Error），并提供详细的 Error Message 指导修正。
-   **全生命周期审计 (Audit Trail)**：
    -   **版本记录**：每一条记录的修改都会被持久化为版本快照。
    -   **GitHub 风格 Diff**：直观展示修改前后的差异，采用经典的红绿配色和行内对比。
    -   **理由追踪**：支持在修改时必填（或后续更新）修改理由，确保每一项更正都有据可查。
-   **一键回滚 (Undo/Rollback)**：支持从历史版本中的任意时间点进行状态恢复，并提供严谨的二次确认对话框。
-   **适配性 UI/UX**：
    -   **硅谷 SaaS 审美**：基于 Shadcn UI 与 Tailwind CSS，提供极简且专业的交互体验。
    -   **自适应高度布局**：修订历史区域自动同步表单高度，支持内部平滑滚动。
    -   **Sonner 全局通知**：替换原生 Alert，提供流畅的非阻塞反馈。
-   **弹性数据解析**：后端实现 `smartUnmarshal` 逻辑，兼容遗留的 Go-struct 格式字符串与标准 JSON。

## 🛠️ 技术栈

### Backend (Go)
-   **框架**: Gin Web Framework
-   **ORM**: GORM (v2)
-   **数据库**: SQLite (可通过 GORM 轻松切换至 PostgreSQL/MySQL)
-   **处理层**: 流式 CSV 解析与异步 Worker 模式
-   **测试**: 集成单元测试确保数据解析逻辑稳定性

### Frontend (React)
-   **工具链**: Vite + TypeScript
-   **样式**: Tailwind CSS (JIT mode)
-   **组件库**: Shadcn UI (基于 Radix UI)
-   **动画**: Framer Motion
-   **图标**: Lucide React
-   **状态管理**: React Hooks + Zod Hook Form

## 📂 项目结构

```bash
.
├── backend/               # Go 后端源码
│   ├── cmd/               # 程序入口
│   ├── internal/
│   │   ├── api/           # 路由与处理器
│   │   ├── model/         # 数据模型 (Record, RecordVersion 等)
│   │   ├── repository/    # 数据库操作
│   │   └── service/       # 业务逻辑 (Data Cleaning, Smart Unmarshal)
│   └── data/              # 数据库文件存放区
├── frontend/              # Vite + React 前端源码
│   ├── src/
│   │   ├── components/    # 业务组件 (BatchDetail, UploadZone 等)
│   │   ├── lib/           # 工具类
│   │   └── ui/            # Shadcn 基础组件
│   └── package.json
└── README.md
```

## 🛠️ 快速上手

### 环境要求
-   Go 1.21+
-   Node.js 18+
-   pnpm (推荐) 或 npm/yarn

### 后端启动
1. 进入 backend 目录: `cd backend`
2. 下载依赖: `go mod tidy`
3. 启动开发服务器: `go run cmd/server/main.go`
   - 服务器将运行在 `http://localhost:8080`

### 前端启动
1. 进入 frontend 目录: `cd frontend`
2. 安装依赖: `pnpm install`
3. 启动开发服务器: `pnpm dev`
   - 应用将运行在 `http://localhost:5173`

## 🧪 验证与测试
后端包含关键业务逻辑的单元测试。运行以下命令验证数据解析的鲁棒性：
```bash
cd backend/internal/service
go test -v processor_test.go
```

## 📝 审计日志示例
系统通过 `RecordVersion` 表实现完整的修改追踪。每一条 Diff 均能清晰展示：
-   **Before**: `{"name": "张三", ...}`
-   **After**: `{"name": "张三 (已更正)", ...}`
-   **Reason**: "根据客户反馈修正姓名拼写"

---
*Created with ❤️ by Antigravity Code Assistant*
