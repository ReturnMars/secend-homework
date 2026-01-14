# System Map (系统映射)

## 🏗️ 架构概览

本项目是一个全栈 ETL (Extract, Transform, Load) 工具，用于处理数据导入、转换和展示。

- **后端 (backend)**: 基于 Go 语言，使用 Gin 框架提供 RESTful API，GORM 进行数据库操作。
- **前端 (frontend)**: 基于 React 19 + Vite，使用 Radix UI 和 Tailwind CSS 4 进行界面构建。
- **基础设施**: 使用 Docker 进行部署，包含 PostgreSQL 数据库。

## 📂 核心目录结构

### 后端 (backend/)

- `cmd/`: 程序入口（主程序及代码生成器等）。
- `internal/`: 核心逻辑。
  - `api/`: 路由转发与 HTTP 处理 (Router, Handlers)。
  - `service/`: 业务逻辑层 (ETL 逻辑, 处理器)。
  - `model/`: 数据库模型定义。
  - `config/`: 配置管理。
  - `middleware/`: 中间件 (CORS, Auth)。
- `migrations/`: 数据库迁移文件。
- `uploads/`: 临时存储上传的文件。

### 前端 (frontend/)

- `src/components/`: 可复用组件。
  - `ui/`: 基础 UI 组件 (Radix, Shadcn 风格)。
  - `batch-detail/`: 批次详情业务组件。
- `src/pages/`: 页面组件 (Dashboard, Login, BatchDetail)。
- `src/context/`: 状态管理 (Auth)。
- `src/lib/`: 工具类 (API 请求封装, Utils)。

## 🔌 关键流转

1. **认证**: 前端通过 `/api/login` 获取 JWT，存储在 `localStorage`。
2. **模型定义**: 后端通过 `generator` 根据配置文件生成相应的 Go 代码和数据库迁移。
3. **数据处理**:
   - 用户上传 Excel -> 后端解构数据 -> 规则验证 -> 存入批次表 -> 异步/同步处理。

## 🛠️ 技术栈

- **Backend**: Go 1.25+, Gin, GORM, Excelize, JWT-Go.
- **Frontend**: React 19, Vite, Tailwind CSS 4, shadcn, Lucide Icons, React Hook Form, Zod.
- **Database**: PostgreSQL.
