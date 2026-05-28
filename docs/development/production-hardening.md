# 生产硬化说明

## 大 Chunk 警告

Vite 构建提示部分 JS chunk 超过 500 kB。该提示不影响功能、安全或内网试运行。

当前系统页面较多，且包含 `recharts`、`xlsx` 等体积较大的依赖，出现该提示符合预期。后续如需优化首屏性能，可单独做代码分包：

1. 对管理页、数据查询、重点店风向监测等页面使用 `React.lazy`。
2. 将 `xlsx` 导出逻辑改为按需动态加载。
3. 为图表库配置手动分包。

本次生产硬化不处理该项。

## 上线前必须配置

生产环境不能使用开发默认密钥。启动前需要配置：

```bash
export FLASK_ENV=production
export FLASK_DEBUG=false
export LEADS_SECRET_KEY="替换为足够长的随机字符串"
export LEADS_DEFAULT_ADMIN_PASSWORD="首次初始化管理员密码"
export STORE_GOVERNANCE_DB_PATH="/home/leads-system/leads-operating/data/store_governance.db"
```

也可以复制 `.env.example` 为 `.env` 后修改。

生产模式下，如果 `LEADS_SECRET_KEY` 为空或仍为开发默认值、`LEADS_DEFAULT_ADMIN_PASSWORD` 为空或仍为默认密码、`STORE_GOVERNANCE_DB_PATH` 未显式设置，后端会拒绝启动。

## 密钥落盘方式

正式发布时不要把 `LEADS_SECRET_KEY`、`LEADS_DEFAULT_ADMIN_PASSWORD` 等敏感变量直接写入 `/etc/systemd/system/leads-backend.service`。

推荐使用 root 拥有、权限为 `600` 的环境变量文件：

```text
/etc/leads-operating/backend.env
```

systemd unit 中只保留引用：

```ini
EnvironmentFile=/etc/leads-operating/backend.env
```

当前 `deploy.sh` 会在部署时自动生成并安装该文件。修改密钥或数据库路径后，执行：

```bash
sudo systemctl daemon-reload
sudo systemctl restart leads-backend
```

## 数据库分工

当前推荐轻量分库：

```text
业务主库：LEADS_RAW_DB_PATH，默认 ../leads.db
权限库：LEADS_AUTH_DB_PATH，默认 ../leads_auth.db
分析库：LEADS_DUCKDB_PATH，默认 data/leads_analytics.db
```

业务主库只保存线索、门店、客流等业务数据。账号、角色、权限、登录日志、操作日志等 `sys_*` 表写入独立权限库。

如果旧业务库已经包含 `sys_*` 表，可执行一次性迁移：

```bash
python scripts/migrate_auth_tables.py --source /path/to/leads.db --target /path/to/leads_auth.db
```

迁移脚本只复制，不会删除旧业务库中的 `sys_*` 表。确认权限库可用后，再人工决定是否清理旧表。

## Session 配置

支持以下环境变量：

```bash
LEADS_SESSION_LIFETIME_SECONDS=28800
LEADS_SESSION_COOKIE_SAMESITE=Lax
LEADS_SESSION_COOKIE_SECURE=false
```

如果部署在 HTTPS 后，建议设置：

```bash
LEADS_SESSION_COOKIE_SECURE=true
```

## 默认管理员

首次初始化时会创建默认管理员：

```text
账号：LEADS_DEFAULT_ADMIN_USERNAME，默认 admin
密码：LEADS_DEFAULT_ADMIN_PASSWORD，默认 Admin@123456
```

生产首次启动前必须通过环境变量改掉默认密码。生产模式下如果未设置 `LEADS_SECRET_KEY` 或异常门店治理库路径 `STORE_GOVERNANCE_DB_PATH`，后端会拒绝启动。

## 密码重置

账号重置密码接口现在默认生成随机临时密码。操作日志不记录明文密码。

## 推荐启动方式

内网试运行可以继续使用：

```bash
python3 backend/app_v2.py
```

正式生产建议使用 gunicorn 或 systemd 托管进程，并在启动前备份真实 `leads.db`。
