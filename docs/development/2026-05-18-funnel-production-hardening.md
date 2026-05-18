# 漏斗目标达成分析 — 2026-05-18 生产加固记录

> 背景：5月17日首次生产部署后，在真实线上环境发现 5 类问题并通过 8 次修复全部闭环  
> 编写日期：2026-05-18  
> 对应文件：`backend/core/funnel_config_backup.py`（新建）、`backend/core/duckdb_manager.py`、`backend/app_v2.py`、`backend/auth/service.py`、`src/hooks/useApi.ts`、nginx 配置、systemd 配置

---

## 一、问题与修复清单

### 1. 点击「同步新数据」报「无法连接到后端服务」

**根因**（3 个叠加）：

| 子问题 | 详情 | 修复 |
|--------|------|------|
| Nginx 默认 60s 超时 | 增量同步需扫描 3.3M 行数据，约 90 秒，nginx 在 60 秒切断请求 | `/etc/nginx/conf.d/leads-system.conf` → `proxy_read_timeout 300s; proxy_connect_timeout 30s;` |
| DuckDB 文件锁冲突 | worker 持有 DuckDB 连接，`load_incremental()` 创建新连接时锁冲突 | [app_v2.py `trigger_refresh()`](file:///Users/bournelll/Desktop/线索运营/线索运营监控系统/backend/app_v2.py#L655-L658)：所有 sync 模式前统一 `duck_db.close() + gc.collect() + time.sleep(0.3)` |
| 前端 fetch 未带 session cookie | [useApi.ts](file:///Users/bournelll/Desktop/线索运营/线索运营监控系统/src/hooks/useApi.ts#L24-L38) 用原始 `fetch()` 未设 `credentials: 'same-origin'` | 两处 fetch 加上 `credentials: 'same-origin'`，同步模式从 `full` 改为 `incremental` |

### 2. 全量刷新导致漏斗配置清空

**根因**：[`initialize()`](file:///Users/bournelll/Desktop/线索运营/线索运营监控系统/backend/core/duckdb_manager.py#L73-L83) 中 `DROP TABLE IF EXISTS` 覆盖了 4 张配置表（成交目标、车型映射、转化率、到店目标），`load_from_sqlite()` 只从 SQLite 加载基础业务数据，配置表无恢复逻辑。

**修复**（方案 B：备份恢复）：

| 层级 | 文件 | 作用 |
|------|------|------|
| 内存备份 | [FunnelConfigBackup](file:///Users/bournelll/Desktop/线索运营/线索运营监控系统/backend/core/funnel_config_backup.py#L29-L46) | `backup()` 从 DuckDB 读取 4 张表到内存（列名字典格式） |
| 文件持久化 | [FunnelConfigBackup](file:///Users/bournelll/Desktop/线索运营/线索运营监控系统/backend/core/funnel_config_backup.py#L81-L91) | 有数据时同时写入 `data/funnel_config_backup.json` |
| 跨进程兜底 | [FunnelConfigBackup](file:///Users/bournelll/Desktop/线索运营/线索运营监控系统/backend/core/funnel_config_backup.py#L93-L103) | `restore()` 内存为空时自动从 JSON 文件加载 |
| 结构兜底 | [duckdb_manager.py](file:///Users/bournelll/Desktop/线索运营/线索运营监控系统/backend/core/duckdb_manager.py#L376-L430) | 4 张配置表改为 `CREATE TABLE IF NOT EXISTS`，不再被 DROP |

### 3. Gunicorn worker 超时（120s）

**根因**：全量刷新需 2-3 分钟，超过 Gunicorn 默认 `--timeout 120`，worker 被 SIGKILL 终止。

**修复**：`/etc/systemd/system/leads-backend.service` → `--timeout 360`

### 4. 提交目标表报 `Object of type datetime is not JSON serializable`

**根因**：`_import_funnel_sales_targets()` 返回字典含 `datetime.now()` 对象 → `record_audit_log()` → `json.dumps()` 无法序列化。

**修复**（双重防御）：

| 文件 | 改动 |
|------|------|
| [app_v2.py L1781](file:///Users/bournelll/Desktop/线索运营/线索运营监控系统/backend/app_v2.py#L1781) | `now` → `now.isoformat()`（源头转字符串） |
| [auth/service.py L387-388](file:///Users/bournelll/Desktop/线索运营/线索运营监控系统/backend/auth/service.py#L387-L388) | `json.dumps(...)` → `json.dumps(..., default=str)`（全局防御） |

### 5. 数据库同步后配置丢失风险

**场景**：用户本地更新 `leads.db`（原始数据）→ rsync 到服务器 → 删除 DuckDB 重建 → 配置表为空。

**安全同步流程**：

```
① full refresh（封存最新配置到 JSON）
  ↓
② 停服 + 备份旧 leads.db
  ↓
③ rsync 新 leads.db
  ↓
④ 删除 leads_analytics.db + .init.lock
  ↓
⑤ 启动 → init_system 从 JSON 恢复配置
```

---

## 二、修改文件总览

| 文件 | 操作 | 改动说明 |
|------|------|---------|
| `backend/core/funnel_config_backup.py` | **新建** | 漏斗配置备份/恢复类，支持内存 + JSON 文件二层持久化 |
| `backend/core/duckdb_manager.py` | 修改 | `initialize()` 拆分 DROP 列表，配置表改 `IF NOT EXISTS` |
| `backend/app_v2.py` | 修改 | `init_system()` / `trigger_refresh()` 集成备份恢复；datetime 序列化修复 |
| `backend/auth/service.py` | 修改 | `json.dumps(default=str)` 全局防御 |
| `src/hooks/useApi.ts` | 修改 | `credentials: 'same-origin'` + `mode: 'incremental'` |
| `/etc/nginx/conf.d/leads-system.conf` | 修改 | `proxy_read_timeout 300s` |
| `/etc/systemd/system/leads-backend.service` | 修改 | `--timeout 360` |
| `docs/development/funnel-config-persistence-plan.md` | 新建 | 漏斗配置持久化开发方案（8 风险应对 + 测试清单） |

---

## 三、架构决策

### 漏斗配置三层防护

```
备份时: DuckDB ──→ ① 内存 {列名:值} 字典
                 └→ ② data/funnel_config_backup.json（跨进程）
                 └→ ③ CREATE TABLE IF NOT EXISTS（结构）

恢复时: restore() ──→ 内存有 → 写 DuckDB
                   └→ 内存空 → JSON 加载 → 写 DuckDB
                   └→ 成功 → 内存 cleanup，JSON 保留
```

### 全量刷新时序

```
backup()（读 4 表 + 写 JSON）
  → initialize()（删计算表，配置表 IF NOT EXISTS 保结构）
  → load_from_sqlite() + compute_all_metrics()
  → restore()（INSERT OR REPLACE 写回配置）
```

---

## 四、验证测试

| 测试项 | 方法 | 结果 |
|--------|------|:--:|
| 同步新数据按钮 | nginx HTTPS 模拟前端请求 | ✅ |
| 全量刷新后配置保留 | `POST /api/refresh/trigger {"mode":"full"}` | ✅ sales 2,328 行保留 |
| 删除 DuckDB 后从 JSON 恢复 | `rm leads_analytics.db` → 重启 | ✅ 4 张表完整恢复 |
| 提交目标表 datetime 序列化 | 生成测试 Excel 上传 | ✅ `now.isoformat()` 生效 |
| 数据库同步 + 配置保留 | 全流程 7 步安全同步 | ✅ 3,396,942 行数据 |

---

## 五、注意事项

1. **full refresh 是配置封存的关键**：每次同步 `leads.db` 前必须先执行 full refresh，确保 `funnel_config_backup.json` 是最新快照。
2. **生产 Gunicorn timeout**：已设为 360s，全量刷新不会超时。
3. **增量同步不需要备份恢复**：`mode='incremental'` 不删除表，config_backup 不会触发。
4. **JSON 文件永不自动删除**：`restore()` 只清内存，JSON 文件长期保留作为兜底。
