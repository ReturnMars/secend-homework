# Database Reset Tool (数据库重置工具)

这是一个用于开发环境下快速清空 ETL 业务数据的维护工具。

## 📍 位置

`backend/cmd/reset_db/main.go`

## 🛠️ 功能

- **物理清空表**: 强制清空 `records` (千万级数据表), `record_versions`, `import_batches`。
- **重置自增 ID**: 使用 `RESTART IDENTITY` 将主键 ID 恢复从 1 开始。
- **安全保护**: 仅允许在 `APP_ENV=dev` 环境下执行，防止生产环境误操作。
- **保留账号**: 不会触碰 `users` 表，管理员及测试账号依然有效。

## 🚀 如何运行

在 `backend` 目录下执行：

```bash
go run cmd/reset_db/main.go
```

## ⚠️ 注意事项

1. **不可逆**: 执行后数据将永久删除，请确保已备份重要测试数据。
2. **环境校验**: 如果在生产环境运行，程序将报错：`[CRITICAL] Database reset is only allowed in 'dev' environment.`
3. **依赖关系**: 使用 `CASCADE` 自动处理外键关联，确保清理彻底。
