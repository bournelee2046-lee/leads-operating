# 线上线索漏斗目标达成分析生产发布说明

> 适用版本：线上线索漏斗目标达成分析一期 + 区域负责人驾驶舱  
> 编写日期：2026-05-17  
> 目的：明确本次可发布到生产环境的功能文件、发布步骤、验证清单和注意事项，避免同步无关文件。

---

## 一、本次发布内容

本次发布的是「线上线索漏斗目标达成分析」功能，包含：

1. 首页新增「线上线索漏斗目标达成」模块。
2. 新增专题页 `/funnel-target-analysis`。
3. 新增区域负责人驾驶舱：
   - 负责人视角 Tab；
   - 核心状态卡；
   - 门店进度状态分布；
   - 大区 / 战区进度汇总；
   - 大区 x 门店列表；
   - 状态、诊断标签同页联动。
4. 新增明细分析：
   - 门店 x 车型；
   - 门店 x 车型 x 渠道。
5. 新增配置能力：
   - 全国到店目标；
   - 成交目标 Excel 导入；
   - 全国统一 / 车型成交倒推转化率；
   - 源车型扫描和车型映射配置；
   - 重算。
6. 新增独立 DuckDB 漏斗主题表和重算逻辑。
7. 新增漏斗权限点和审计动作。

---

## 二、必须发布的文件

请只同步以下文件到生产环境，避免带入当前工作区中与本功能无关的删除或改动。

### 2.1 后端核心文件

```text
backend/app_v2.py
backend/core/duckdb_manager.py
backend/auth/permissions.py
backend/auth/service.py
backend/config.py
```

说明：

- `app_v2.py`：新增漏斗目标配置、导入、重算、驾驶舱、明细查询接口。
- `duckdb_manager.py`：新增漏斗主题表、车型映射扫描、实际指标计算、目标进度计算。
- `permissions.py`：新增漏斗页面、接口和配置权限点。
- `service.py`：新增漏斗相关审计动作。
- `config.py`：支持通过环境变量配置 DuckDB 路径。

### 2.2 前端核心文件

```text
src/App.tsx
src/hooks/useApi.ts
src/pages/Home.tsx
src/pages/FunnelTargetAnalysis.tsx
src/components/funnel/FunnelHomeCard.tsx
vite.config.ts
```

说明：

- `App.tsx`：新增 `/funnel-target-analysis` 路由。
- `useApi.ts`：新增漏斗接口数据请求 Hook。
- `Home.tsx`：首页接入漏斗目标达成模块。
- `FunnelTargetAnalysis.tsx`：新增驾驶舱、明细分析和配置中心页面。
- `FunnelHomeCard.tsx`：首页漏斗模块。
- `vite.config.ts`：开发环境 API 代理支持 `LEADS_API_TARGET`，默认仍为 `http://localhost:5001`。

### 2.3 启动、部署和迁移文件

```text
deploy.sh
start.sh
scripts/migrate_auth_tables.py
README_SETUP.md
```

说明：

- `start.sh`：增强本地启动时对旧后端端口占用的处理提示。
- `deploy.sh`：保留当前部署脚本调整。
- `scripts/migrate_auth_tables.py`：用于账号权限表结构和权限点迁移。
- `README_SETUP.md`：更新项目结构说明。

### 2.4 产品和开发文档

```text
docs/product/线上线索漏斗目标达成分析PRD.md
docs/development/funnel-target-analysis-development-plan.md
docs/development/funnel-target-analysis-production-release-guide.md
```

文档不影响运行，但建议随代码发布，便于线上问题排查和后续维护。

---

## 三、不要随本功能发布的当前工作区变更

当前本地工作区存在一些与本功能无关的删除或改动，不建议随本次功能发布同步。

不要因为 `git status` 中出现而直接同步这些文件：

```text
check_channels.py
check_db_structure.py
check_leads_db.py
check_schema.py
debug_init.py
debug_refresh.py
explore_lead_fields.py
simple_test.py
test_architecture.py
test_dashboard.py
test_db_locking.py
prototype-dimension-data.html
screenshot-*.png
若干旧产品文档删除项
artifacts/
prototypes/
docs/reports/
public/icons/
logo.png
public/logo.png
```

建议发布方式：

```text
只按第二节文件清单同步，不做整目录覆盖。
```

---

## 四、生产发布前备份

发布前建议在云服务器执行：

```bash
cd <生产项目目录>
mkdir -p backups
tar -czf backups/leads-monitor-code-$(date +%Y%m%d-%H%M%S).tar.gz \
  backend src scripts docs deploy.sh start.sh vite.config.ts README_SETUP.md package.json package-lock.json requirements.txt
```

数据库建议单独备份：

```bash
cp data/leads_analytics.db backups/leads_analytics-$(date +%Y%m%d-%H%M%S).db
cp data/leads_auth.db backups/leads_auth-$(date +%Y%m%d-%H%M%S).db
```

注意：

- 不建议用本地数据库覆盖云端数据库，除非明确要替换线上数据。
- 本次发布主要同步代码，不同步 `data/*.db`。

---

## 五、推荐发布步骤

### 5.1 同步文件

将第二节文件清单同步到云服务器对应路径。

示例：

```bash
rsync -av backend/app_v2.py <user>@<server>:<project>/backend/app_v2.py
rsync -av backend/core/duckdb_manager.py <user>@<server>:<project>/backend/core/duckdb_manager.py
rsync -av backend/auth/permissions.py <user>@<server>:<project>/backend/auth/permissions.py
rsync -av backend/auth/service.py <user>@<server>:<project>/backend/auth/service.py
rsync -av backend/config.py <user>@<server>:<project>/backend/config.py
rsync -av src/App.tsx <user>@<server>:<project>/src/App.tsx
rsync -av src/hooks/useApi.ts <user>@<server>:<project>/src/hooks/useApi.ts
rsync -av src/pages/Home.tsx <user>@<server>:<project>/src/pages/Home.tsx
rsync -av src/pages/FunnelTargetAnalysis.tsx <user>@<server>:<project>/src/pages/FunnelTargetAnalysis.tsx
rsync -av src/components/funnel/FunnelHomeCard.tsx <user>@<server>:<project>/src/components/funnel/FunnelHomeCard.tsx
rsync -av vite.config.ts <user>@<server>:<project>/vite.config.ts
```

也可以将清单写入 `release-files.txt` 后统一同步。

### 5.2 安装或确认依赖

Python 依赖需包含：

```text
openpyxl
duckdb
flask
flask-cors
```

前端依赖按项目现有 `package.json` 安装。

```bash
pip install -r requirements.txt
npm install
```

### 5.3 初始化权限点

重启后端时，`init_system()` 会执行权限初始化逻辑。若生产环境角色已存在但权限未刷新，可执行：

```bash
python3 scripts/migrate_auth_tables.py
```

或重启后端后，在角色管理页面确认以下权限点已出现：

```text
funnel_target.view
funnel_target.home_card
funnel_target.dashboard_summary
funnel_target.dashboard_regions
funnel_target.query_dealer_models
funnel_target.query_org_dealers
funnel_target.query_channels
funnel_target.filter
funnel_target.config.view
funnel_target.config.manage
funnel_target.sales_target.import
funnel_target.recompute
```

### 5.4 重启服务

如果生产使用 `start.sh`：

```bash
./start.sh
```

如果使用 systemd / supervisor / pm2 / nginx，请按线上现有方式重启。

后端默认端口仍为：

```text
5001
```

也支持环境变量指定：

```bash
PORT=5001 python3 backend/app_v2.py
```

DuckDB 路径支持：

```bash
LEADS_DUCKDB_PATH=/path/to/leads_analytics.db
LEADS_AUTH_DB_PATH=/path/to/leads_auth.db
```

---

## 六、上线后首次操作

### 6.1 触发重算

登录系统后进入：

```text
/funnel-target-analysis
```

点击「重算」。

也可调用接口：

```bash
curl -X POST http://localhost:5001/api/funnel-target/recompute \
  -H "Content-Type: application/json" \
  -b "<登录 Cookie>" \
  -d '{"year_month":"2026-05"}'
```

### 6.2 配置基础目标

需要至少完成：

1. 全国到店目标配置。
2. 成交目标 Excel 导入。
3. 全国统一成交倒推转化率配置。
4. 车型映射配置。
5. 保存配置后重算。

---

## 七、生产验证清单

### 7.1 后端健康检查

```bash
curl http://localhost:5001/api/health
```

### 7.2 登录验证

```text
登录页可正常登录。
刷新页面后不会出现 500。
```

### 7.3 首页验证

首页应展示：

```text
线上线索漏斗目标达成模块
当月到店数
全国目标达成率
时间进度
数据进度
到店目标缺口
```

### 7.4 驾驶舱验证

进入：

```text
/funnel-target-analysis
```

验证：

- 默认进入「驾驶舱」；
- 负责人视角 Tab 可切换；
- 切换负责人后：
  - 管理门店数变化；
  - 到店数变化；
  - 状态分布变化；
  - 大区 / 战区汇总变化；
  - 大区 x 门店列表变化；
- 点击严重落后 / 轻度落后 / 配置异常后，门店列表正确过滤；
- 点击诊断标签后，门店列表正确过滤；
- 点击大区 / 战区后，门店列表正确联动。

### 7.5 明细分析验证

验证：

- 门店 x 车型表有数据；
- 应用转化率、转化率来源、倒推应达到店、倒推达成率展示正常；
- 点击门店「查看车型」可进入明细；
- 点击门店「查看渠道」可进入渠道明细；
- 门店 x 车型 x 渠道表支持二级渠道、三级渠道筛选。

### 7.6 配置中心验证

验证：

- 全国到店目标可保存；
- 成交目标 Excel 可导入；
- 转化率配置浮层可查看已保存配置；
- 车型映射配置可扫描、保存、重算；
- 保存配置后数据刷新。

---

## 八、已知限制和后续优化

1. 区域负责人数据范围暂依赖账号 `display_name` 与门店表 `线索运营区域负责人` 一致。
2. 小范围使用场景下可暂不配置复杂数据权限；若开放给更多用户，需完善账号到负责人/门店范围的映射。
3. 驾驶舱诊断标签第一版为规则判断，后续可配置化阈值。
4. 目标导入第一版依赖当前 Excel 样例结构，后续如模板变化需同步调整解析逻辑。
5. 当前发布不包含导出功能完整建设。

---

## 九、回滚建议

如上线后出现严重问题，建议：

1. 停止服务。
2. 恢复第四节备份的代码包。
3. 恢复数据库备份，若本次发布已经执行了重算或配置变更。
4. 重启服务。

示例：

```bash
cd <生产项目目录>
tar -xzf backups/leads-monitor-code-YYYYMMDD-HHMMSS.tar.gz
cp backups/leads_analytics-YYYYMMDD-HHMMSS.db data/leads_analytics.db
cp backups/leads_auth-YYYYMMDD-HHMMSS.db data/leads_auth.db
./start.sh
```

---

## 十、本地验证记录

本地正式库验证结果：

```text
后端：http://localhost:5001
前端：http://localhost:5182/funnel-target-analysis
管理门店数：494
当月到店数：14,099
时间进度：54.8%
数据进度：45.2%
最新线索日期：2026-05-14
严重落后门店：331
```

检查命令：

```bash
npm run check
python3 -m py_compile backend/app_v2.py backend/core/duckdb_manager.py backend/auth/*.py
```

均已通过。
