# 🚀 部署系统架构任务书

## 目标
构建一套“本地编译、镜像传输、远程拉起”的自研自动化部署系统。

## 任务清单

### 1. 基础设施配置 (Infrastructure)
- [x] 创建 `infra/Dockerfile.frontend`: 极简 Nginx 托管容器。
- [x] 创建 `infra/nginx.conf`: 生产环境网关配置（反代、静态分发）。
- [x] 创建 `infra/Dockerfile.backend`: Alpine 基础上的零依赖 Go 运行容器。
- [x] 创建 `infra/docker-compose.prod.yml`: 生产环境编排，包含资源限制（DB 400M, Backend 1G）。

### 2. 代码适配与优化 (Optimizations)
- [x] 创建项目根目录 `config.example.yaml` 模板文件。
- [ ] 修改后端配置加载：支持从 `config.yaml` 解析配置。
- [x] 修改前端 API 配置：通过构建时环境变量动态注入。
- [ ] 确保上传目录 `./uploads` 在业务代码中已正确定义。

### 3. 部署工具 `deployer` 开发
- [x] 初始化 `deployer/` Go 项目并集成 SSH/SFTP 库。
- [x] 实现 `builder`: 负责本地构建与交叉编译。
- [x] 实现 `imagizer`: 镜像压缩打包。
- [x] 实现 `transporter`: SFTP 密码认证上传。
- [x] 实现 `executor`: 远程 SSH 自动化部署与环境清理。
- [x] **实战验证**: 成功在阿里云 2核2G 服务器完成全栈部署。

### 4. 硬盘与内存监控
- [x] 配置 Docker 日志切割策略，防止 40G 硬盘溢出（max-size: 50m）。
- [x] **生产环境验证**: 前后端连通，数据库 Migrations 正常，502 错误彻底解决。

---

## 🏆 项目里程碑：全栈自动化部署圆满成功！
- [x] 基础设施 Docker 化
- [x] 本地交叉编译
- [x] SFTP 离线镜像传输
- [x] 远程自动化编排与健康诊断

---

## 策略备注
1. **持久化策略**: 只有 PostgreSQL 使用挂载卷；前端和后端容器不挂载目录。
2. **清理策略**: 每次部署自动通过 `docker stack/compose up` 覆盖旧容器，自动擦除旧上传文件。
3. **内存管理**: 基于 2核2G 机器。静态资源由 Nginx 承载，Go 任务池限制 Excel 并发处理。
