# 门店档案与门店管理功能合并 PRD

## 1. 背景与目标

当前存在两个系统：

- 线索运营监控系统：React/Vite 前端 + Flask API，已有账号权限、运营日报、跟进分布、重点店监测、数据查询等模块。
- 异常店治理工具：Flask 模板应用，已实现门店档案、门店详情、门店管理、跟进任务与跟进历史能力。

本阶段目标是将异常店治理工具中的「门店档案」和「门店管理」能力逐步迁移到线索运营监控系统中，先实现入口、查询、展示、管理配置与权限控制，为后续把跟进治理完整迁移到统一系统打基础。

核心产品目标：

- 从任务视角沉淀到门店视角：按门店聚合日报趋势、跟进历史、原因分析和长期问题识别。
- 补充日报无法表达的运营信息：维护门店经营状态、评级、状态备注、管理员备注。
- 保持原始门店数据与管理数据隔离：基础信息从 `leads.db` 或同步分析表读取，管理配置存储在 `日报.db` 或迁移后的独立 SQLite 管理库中。
- 接入监控系统现有 RBAC 权限体系，避免沿用异常店工具的 Session + 单表权限模型。

## 2. 现状理解

### 2.1 线索运营监控系统

- 前端入口在 `src/App.tsx` 配置，页面在 `src/pages` 下，受 `ProtectedRoute` 和权限码控制。
- 后端主接口在 `backend/app_v2.py`，接口统一返回 `{success, data, message}` 风格。
- 权限树在 `backend/auth/permissions.py`，支持 page/api/button 类型权限，并通过 `@require_permission` 控制 API。
- 门店基础数据已进入 DuckDB 分析表 `mart_dealers`，日报指标进入 `report_dealer_daily`，线索明细进入 `mart_leads`。
- 原始业务库路径由 `backend/config.py` 的 `RAW_DB_PATH` 配置，默认指向 `/Users/bournelll/Desktop/线索运营/leads.db`。

### 2.2 异常店治理工具

- 已有入口：
  - `/store_profile`
  - `/store_detail/<store_code>`
  - `/store_management`
- 已有门店档案 API：
  - `/api/store_profile/search`
  - `/api/store_profile/<store_code>/basic_info`
  - `/api/store_profile/<store_code>/daily_stats`
  - `/api/store_profile/<store_code>/follow_history`
  - `/api/store_profile/follow_summary`
  - `/api/store_profile/store_list`
  - `/api/store_profile/frequent_stores`
  - `/api/store_profile/reason_analysis`
- 已有门店管理 API：
  - `/api/store_management/stores`
  - `/api/store_management/store/update`
  - `/api/store_management/statuses`
  - `/api/store_management/ratings`
  - `/api/store_management/status`
  - `/api/store_management/init`
  - `/api/store_management/filters`
- 管理数据当前存储于异常店工具的 `日报.db`：
  - `门店管理配置表`
  - `门店状态配置表`
  - `跟进任务`
  - `跟进记录`
  - `跟进原因配置`
- 基础门店信息来自 `/Users/bournelll/Desktop/线索运营/leads.db` 的 `门店表`，当前约 495 家门店。

## 3. 本期范围

### 3.1 新增页面入口

新增监控系统前端路由：

- `/store_profile`：门店档案列表页。
- `/store_detail/:store_code`：门店详情页。
- `/store_management`：门店管理页。

建议在「经销商管理」模块中新增两个卡片入口：

- 门店档案
- 门店管理

如后续产品希望更强调治理链路，也可独立成「门店治理」一级入口。本期先复用现有经销商管理入口，改动更稳。

### 3.2 门店档案

目标：从跟进任务沉淀到门店视角，辅助识别长期问题门店。

功能要求：

- 支持按店编号、店简称搜索门店。
- 支持大区、战区、是否被跟进筛选。
- 支持时间范围筛选日报趋势。
- 列表展示门店基础信息、平均线索量、平均到店数、平均到店率、是否有跟进记录。
- 门店详情展示：
  - 基础信息：店编号、店简称、大区、战区、大区经理、战区经理、巡回员等。
  - 日报趋势：线索量、到店数、到店率，支持近 7 天、近 30 天、自定义日期。
  - 周期摘要：周期线索量、到店数、平均到店率、数据天数。
  - 跟进历史：任务名称/周开始日期、日报日期、跟进原因、备注、操作人、创建时间。
  - 原因分析：该门店历史原因分布、最近一次原因、重复出现原因。
- 高频问题门店识别：
  - 默认识别跟进次数 >= 3 的门店。
  - 支持调整最小跟进次数。
  - 展示首次跟进时间、最后跟进时间、跟进次数、原因汇总。

### 3.3 门店管理

目标：维护门店经营状态、评级和管理备注，补充日报数据无法表达的信息。

功能要求：

- 从 `leads.db` 的 `门店表` 或监控系统同步后的 `mart_dealers` 读取门店基础信息。
- 管理配置与原始门店库隔离，不写入 `leads.db`。
- 门店列表支持：
  - 大区筛选。
  - 战区筛选。
  - 门店状态筛选。
  - 门店评级筛选。
  - 店编号/店简称搜索。
  - 分页。
- 单店编辑支持：
  - 门店状态。
  - 门店评级。
  - 状态备注。
  - 管理员备注。
- 配置管理支持：
  - 评级配置：新增、编辑、删除、颜色、排序。
  - 状态配置：本期建议只读同步 `leads.db.门店表.门店状态`，避免与源库经营状态冲突；若需自定义治理状态，建议命名为「治理状态」并单独存储。
- 操作需记录审计日志。

## 4. 数据设计

### 4.1 数据源原则

- 门店基础信息：优先使用监控系统 `mart_dealers`；如需实时读取源库字段，则从 `RAW_DB_PATH` 连接 `leads.db.门店表`。
- 日报趋势：优先使用监控系统现有 `report_dealer_daily` 和可按日期计算的 `mart_leads` / 客流表；如需要完全复刻异常店工具历史日报，则需接入 `日报.db.日报快照`。
- 跟进历史：本期读取异常店工具 `日报.db.跟进记录`、`跟进任务`。后续迁移跟进治理时，再将表结构纳入监控系统管理库。
- 门店管理配置：存储在独立管理库，建议新增配置 `STORE_GOVERNANCE_DB_PATH`，默认指向 `/Users/bournelll/Desktop/线索运营/异常店治理工具/日报.db`，后续可平滑迁入监控系统 `data/store_governance.db`。

### 4.2 表结构复用

复用或迁移以下表：

```sql
CREATE TABLE 门店管理配置表 (
    管理ID INTEGER PRIMARY KEY AUTOINCREMENT,
    店编号 TEXT UNIQUE NOT NULL,
    门店状态 TEXT DEFAULT '正常',
    状态备注 TEXT,
    管理员备注 TEXT,
    创建时间 TEXT DEFAULT (datetime('now')),
    更新时间 TEXT DEFAULT (datetime('now')),
    门店评级 TEXT
);

CREATE TABLE 门店状态配置表 (
    状态ID INTEGER PRIMARY KEY AUTOINCREMENT,
    状态名称 TEXT UNIQUE NOT NULL,
    状态颜色 TEXT,
    排序 INTEGER DEFAULT 0,
    创建时间 TEXT DEFAULT (datetime('now')),
    配置类型 TEXT DEFAULT '状态'
);
```

跟进历史读取：

```sql
跟进任务(任务ID, 任务名称, 周开始日期, 状态, 创建时间, ...)
跟进记录(记录ID, 任务ID, 日报数据日期, 店编号, 店简称, 跟进原因, 备注, 操作人, 创建时间, 跟进时间, ...)
```

## 5. API 设计

### 5.1 门店档案

- `GET /api/store-profile/search?q=`
  - 搜索门店，返回店编号、店简称、大区、战区。
- `GET /api/store-profile/stores`
  - 参数：`page`、`page_size`、`region`、`zone`、`search`、`follow_status`、`start_date`、`end_date`。
  - 返回门店列表、周期均值、是否跟进、分页。
- `GET /api/store-profile/summary`
  - 返回总跟进门店数、总跟进记录数、平均跟进次数、高频门店数、原因 Top10。
- `GET /api/store-profile/frequent-stores`
  - 参数：`min_times`、`region`、`zone`、`search`、`sort`、`order`、`page`、`page_size`。
  - 返回多次被跟进门店。
- `GET /api/store-profile/reason-analysis`
  - 返回跟进原因分布和涉及门店。
- `GET /api/store-profile/<store_code>/basic-info`
  - 返回门店基础信息。
- `GET /api/store-profile/<store_code>/daily-stats`
  - 参数：`start_date`、`end_date`。
  - 返回日报趋势。
- `GET /api/store-profile/<store_code>/follow-history`
  - 返回该门店全部跟进历史。

### 5.2 门店管理

- `GET /api/store-management/stores`
  - 参数：`page`、`page_size`、`region`、`zone`、`store_status`、`store_rating`、`search`。
  - 返回门店基础信息 + 管理配置。
- `PATCH /api/store-management/stores/<store_code>`
  - 请求体：`store_status`、`store_rating`、`status_note`、`admin_note`。
  - 新增或更新门店管理配置。
- `GET /api/store-management/statuses?type=状态|评级`
  - 获取状态或评级列表。
- `POST /api/store-management/statuses`
  - 新增状态或评级配置。
- `PATCH /api/store-management/statuses/<id>`
  - 编辑配置。
- `DELETE /api/store-management/statuses/<id>`
  - 删除配置。
- `GET /api/store-management/filters`
  - 返回大区、战区、状态、评级选项。

## 6. 权限设计

新增权限树：

- `store_profile.view`：查看门店档案页。
  - `store_profile.query`：查询门店档案。
  - `store_profile.detail.view`：查看门店详情。
  - `store_profile.frequent.view`：查看高频问题门店。
  - `store_profile.reason_analysis.view`：查看原因分析。
- `store_management.view`：查看门店管理页。
  - `store_management.query`：查询门店管理列表。
  - `store_management.edit`：编辑门店状态、评级和备注。
  - `store_management.config.view`：查看状态/评级配置。
  - `store_management.config.manage`：新增、编辑、删除配置。

前端页面使用 `ProtectedRoute` 控制入口，按钮按 `hasPermission` 控制显示。后端 API 使用 `@require_permission` 控制访问。

## 7. 前端页面要求

### 7.1 门店档案列表页

页面结构：

- 顶部标题与返回按钮。
- 筛选区：搜索、大区、战区、跟进状态、日期范围。
- 汇总卡片：跟进门店数、跟进记录数、平均跟进次数、高频门店数。
- Tabs：
  - 全部门店。
  - 高频问题门店。
  - 原因分析。
- 表格支持分页、排序、进入详情。

### 7.2 门店详情页

页面结构：

- 门店标题区：店简称、店编号、大区、战区、管理状态、评级。
- 基础信息面板。
- 日期筛选。
- 趋势图：线索量、到店数、到店率。
- 周期摘要。
- 跟进历史列表。
- 详细日报数据表。

### 7.3 门店管理页

页面结构：

- 汇总卡片：门店总数、正常经营、异常/停业、已配置评级。
- 筛选区：大区、战区、状态、评级、搜索。
- 门店表格：店编号、店简称、大区、战区、状态、评级、状态备注、管理员备注、更新时间、操作。
- 编辑弹窗。
- 配置弹窗：状态/评级配置。

## 8. 非功能要求

- 查询使用参数化 SQL，禁止拼接用户输入。
- 分页默认 50 条，最大 200 条。
- 管理配置写入需记录审计日志，包含操作人、店编号、修改前、修改后。
- 读取外部 `日报.db` 时需处理文件不存在、表不存在、字段缺失，返回可理解错误。
- 日期统一输出 `YYYY-MM-DD`，时间统一输出 `YYYY-MM-DD HH:mm:ss`。
- 不修改 `leads.db`。

## 9. 验收标准

- 有权限用户可访问 `/store_profile`、`/store_detail/:store_code`、`/store_management`。
- 无权限用户访问页面跳转无权限页，访问 API 返回 403。
- 门店档案可搜索门店，并可进入详情。
- 门店详情可展示基础信息、日报趋势、跟进历史。
- 高频问题门店可识别被跟进次数 >= 3 的门店。
- 原因分析可展示原因出现次数、涉及门店数、占比。
- 门店管理可展示来自基础门店库的门店信息。
- 门店管理可编辑状态、评级、状态备注、管理员备注，刷新后数据仍保留。
- 状态/评级配置受权限控制。
- 所有管理写操作进入监控系统审计日志。

## 10. 实施建议

建议按以下顺序实现：

1. 后端增加治理库连接与表初始化，先只读接入异常店工具 `日报.db`。
2. 增加权限码并初始化到现有权限系统。
3. 实现门店档案 API 和门店管理 API。
4. 新增 React 页面与路由。
5. 在经销商管理页增加入口卡片。
6. 联调权限、筛选、详情、写入和审计日志。
7. 再评估是否把 `日报.db` 中治理表迁入监控系统 `data/store_governance.db`。

## 11. 待确认问题

1. 「门店状态」是否必须以 `leads.db.门店表.门店状态` 为准？如果要允许人工维护，建议新增字段名「治理状态」，避免和经营状态混淆。
2. 门店档案日报趋势是否必须复用异常店工具的 `日报快照` 历史口径，还是可使用监控系统现有 `report_dealer_daily`/实时计算口径？
3. 门店管理数据本期是否继续写入异常店工具 `日报.db`，还是直接迁入监控系统 `data/store_governance.db`？
4. 高频问题店默认阈值是否定为跟进次数 >= 3？
5. 门店档案是否需要纳入 `store_management` 权限，还是单独开放 `store_profile.view`？
