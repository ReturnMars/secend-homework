# Reset Database Tool

用于重置数据库中的业务数据表，保留用户表。

## ⚠️ 警告

此工具会 **永久删除** 以下表中的所有数据：

- `records`
- `record_versions`
- `import_batches`

---

## 开发环境 (Dev)

```bash
# 从 backend/ 目录运行
go run ./cmd/reset_db
```

**安全机制**：只有当 `APP_ENV=dev` 或未设置时才能运行。

---

## 生产环境 (Prod) 🔴

通过 SSH 连接服务器并在 Docker 容器内执行 SQL：

```bash
# 连接服务器
ssh root@47.109.195.0

# 进入项目目录
cd /root/apps/etl-tool

# 通过 docker compose 进入 PostgreSQL 容器执行 SQL
docker compose -f docker-compose.prod.yml exec db psql -U postgres -d etl_db -c \
  "TRUNCATE TABLE records, record_versions, import_batches RESTART IDENTITY CASCADE;"
```
