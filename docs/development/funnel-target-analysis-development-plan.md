# 线上线索漏斗目标达成分析开发计划

> 目标：基于《线上线索漏斗目标达成分析 PRD》拆解可恢复、可验证的开发阶段。  
> PRD：`docs/product/线上线索漏斗目标达成分析PRD.md`  
> 创建日期：2026-05-17

---

## 一、开发目标

建设一个独立的「线上线索漏斗目标达成分析」功能，覆盖：

- 首页「线上线索漏斗目标达成」模块。
- 专题页 `/funnel-target-analysis`，默认进入区域负责人驾驶舱。
- 独立 DuckDB 指标表。
- 全国到店目标配置。
- 成交目标 Excel 导入。
- 全国统一转化率 + 车型转化率覆盖。
- 源车型自动扫描 + 车型映射配置。
- 驾驶舱同页联动大区 x 门店列表。
- 门店 x 车型、门店 x 车型 x 渠道明细分析。

核心约束：

- 仅统计线上线索。
- 仅统计当前门店表管理范围内的门店。
- 有效线索 = `线索状态 = 跟进中`。
- 到店数 = 线上进店客流，同线索同门店同日去重，不跨日去重。
- 成交排除 `四级渠道 = APP订单-排产定`。
- 首页和专题页第一版只看当月累计。
- 时间进度按自然日展示。
- 全国到店目标达成率、应达到店、缺口、预计月底等目标进度类指标按最新线上线索日期对应的数据进度计算。
- 未映射车型数据不丢弃，保留实际指标但不参与成交目标倒推。
- 驾驶舱优先服务区域负责人，点击状态、大区、战区、诊断标签后同页刷新门店列表。

---

## 二、总体架构

### 2.1 数据层

在 DuckDB 中新增独立主题表，不复用现有指标表口径。

建议新增表：

| 表名 | 作用 |
| :--- | :--- |
| `funnel_national_visit_targets` | 全国月度到店目标配置 |
| `funnel_sales_targets` | 门店 x 车型成交目标配置，支持 Excel 导入 |
| `funnel_conversion_rates` | 全国统一 / 车型转化率配置 |
| `funnel_model_source_values` | 从线索、到店、成交、成交目标源数据扫描出的原始车型值 |
| `funnel_model_mapping` | 原始车型值到标准车型映射，按来源类型和来源字段区分 |
| `funnel_metric_daily` | 日期 x 门店 x 车型 x 渠道日粒度实际指标 |
| `funnel_metric_monthly` | 月份 x 门店 x 车型 x 渠道月累计实际指标 |
| `funnel_metric_targets` | 月份 x 门店 x 车型目标、进度、缺口结果 |
| `funnel_import_logs` | 目标导入日志与摘要 |

### 2.2 后端接口

新增 API 前缀：

```text
/api/funnel-target
```

建议接口：

| 接口 | 方法 | 用途 |
| :--- | :--- | :--- |
| `/api/funnel-target/home-summary` | GET | 首页模块数据 |
| `/api/funnel-target/dashboard-summary` | GET | 驾驶舱核心卡片、状态分布、诊断摘要 |
| `/api/funnel-target/dashboard-regions` | GET | 驾驶舱大区 / 战区汇总 |
| `/api/funnel-target/org-dealers` | GET | 驾驶舱大区 x 门店列表 |
| `/api/funnel-target/overview` | GET | 专题页范围总览，可作为兼容接口保留 |
| `/api/funnel-target/dealer-models` | GET | 门店 x 车型主表 |
| `/api/funnel-target/channels` | GET | 门店 x 车型 x 渠道表 |
| `/api/funnel-target/filter-options` | GET | 筛选项枚举 |
| `/api/funnel-target/config/visit-targets` | GET/POST | 全国到店目标配置 |
| `/api/funnel-target/config/conversion-rates` | GET/POST | 转化率配置 |
| `/api/funnel-target/config/sales-targets/import` | POST | 成交目标 Excel 导入 |
| `/api/funnel-target/config/sales-targets` | GET | 成交目标查询 |
| `/api/funnel-target/config/model-source-values` | GET | 查询源车型扫描清单 |
| `/api/funnel-target/config/model-mappings` | GET/POST | 查询和保存车型映射 |
| `/api/funnel-target/config/model-source-values/scan` | POST | 重新扫描源车型值 |
| `/api/funnel-target/export` | GET/POST | 专题页导出 |

### 2.3 前端页面

新增页面：

| 文件 | 作用 |
| :--- | :--- |
| `src/pages/FunnelTargetAnalysis.tsx` | 专题页 |
| `src/components/funnel/FunnelHomeCard.tsx` | 首页模块 |
| `src/components/funnel/FunnelDashboard.tsx` | 区域负责人驾驶舱 |
| `src/components/funnel/FunnelStatusCards.tsx` | 驾驶舱状态卡和状态分布 |
| `src/components/funnel/FunnelRegionSummary.tsx` | 大区 / 战区汇总 |
| `src/components/funnel/FunnelDealerList.tsx` | 大区 x 门店主表 |
| `src/components/funnel/FunnelOverview.tsx` | 范围总览，可作为兼容组件保留 |
| `src/components/funnel/FunnelDealerModelTable.tsx` | 门店 x 车型 |
| `src/components/funnel/FunnelChannelTable.tsx` | 门店 x 车型 x 渠道 |
| `src/components/funnel/FunnelConfigPanel.tsx` | 配置入口 |
| `src/components/funnel/FunnelModelMappingPanel.tsx` | 源车型扫描和映射配置 |

---

## 三、阶段拆解

## 阶段 0：现状摸底与字段确认

- 状态：已完成
- 目标：确认原始数据字段、门店表字段、样例 Excel 结构，避免开发阶段口径偏差。

### 任务

1. 确认 DuckDB 当前已有表：
   - `mart_leads`
   - `mart_dealers`
   - `mart_customer_visit`
   - `fact_daily_visit`
   - `mart_online_sales`
2. 确认门店表是否已包含：
   - 线索运营区域负责人
   - 线索运营-区域支持
3. 若当前 `mart_dealers` 未包含上述字段，确定原始 SQLite 门店表字段名，并补充同步。
4. 确认跟进表中意向车系编码字段名，为后续车型映射预留。
5. 固化 `终端目标样例.xlsx` 导入解析规则。

### 检查点

- 输出字段确认记录到本开发计划的「字段确认记录」小节。
- 能用 SQL 查询出本月线上线索中：
  - 当前门店表内线索量
  - 未匹配当前门店表线索量
- 能解析 `终端目标样例.xlsx` 得到门店总成交目标和车型成交目标。

---

## 阶段 1：DuckDB 表结构与初始化

- 状态：已完成
- 目标：新增功能所需表结构，接入初始化流程。
- 主要文件：
  - `backend/core/duckdb_manager.py`
  - 如有必要新增 `backend/core/funnel_target.py`

### 任务

1. 新增配置表：
   - `funnel_national_visit_targets`
   - `funnel_sales_targets`
   - `funnel_conversion_rates`
   - `funnel_model_mapping`
   - `funnel_import_logs`
2. 新增指标表：
   - `funnel_metric_daily`
   - `funnel_metric_monthly`
   - `funnel_metric_targets`
3. 初始化时支持建表。
4. 非全量重建场景下支持 `ALTER TABLE ADD COLUMN IF NOT EXISTS` 兼容升级。
5. 把新增表加入必要的数据查询元数据，便于排查。

### 建议字段

#### `funnel_metric_monthly`

核心粒度：

```text
year_month x dealer_id x model_name x channel_1 x channel_2 x channel_3 x channel_4
```

关键字段：

- `year_month`
- `dealer_id`
- `dealer_name`
- `region`
- `zone`
- `lead_ops_owner`
- `lead_ops_support`
- `model_code`
- `model_name`
- `channel_1`
- `channel_2`
- `channel_3`
- `channel_4`
- `online_lead_count`
- `valid_lead_count`
- `visit_record_count`
- `visit_count`
- `sales_count`
- `lead_valid_rate`
- `lead_visit_rate`
- `valid_lead_visit_rate`
- `lead_sales_rate`
- `valid_lead_sales_rate`
- `visit_sales_rate`
- `unmapped_model_flag`
- `created_at`
- `updated_at`

#### `funnel_metric_targets`

核心粒度：

```text
year_month x dealer_id x model_name
```

关键字段：

- `national_visit_target`
- `dealer_online_lead_share`
- `dealer_visit_target`
- `elapsed_day_ratio`
- `dealer_visit_target_to_date`
- `dealer_visit_gap`
- `dealer_visit_achievement_rate`
- `sales_target`
- `applied_conversion_rate`
- `conversion_rate_source`
- `derived_visit_target`
- `derived_visit_target_to_date`
- `derived_visit_gap`
- `derived_achievement_rate`
- `projected_month_end_visit`
- `status_label`

### 检查点

- `python -m py_compile backend/core/duckdb_manager.py`
- 本地初始化 DuckDB 后新增表存在。
- 重复初始化或升级不报错。

---

## 阶段 2：目标配置与 Excel 导入

- 状态：已完成
- 目标：支持全国到店目标、转化率、成交目标导入。
- 主要文件：
  - `backend/app_v2.py`
  - `backend/core/duckdb_manager.py`
  - 可新增 `backend/services/funnel_target_service.py`

### 任务

1. 新增全国到店目标配置接口。
2. 新增转化率配置接口：
   - 全国统一
   - 车型覆盖
3. 新增成交目标 Excel 导入接口。
4. 解析 `终端目标样例.xlsx` 多层表头：
   - `合计 - 终端目标`
   - 车型 `终端`
   - 车型 `终端小计`
5. 导入时按当前门店表过滤：
   - 当前门店表内门店导入
   - 当前门店表外门店跳过
6. 写入导入日志：
   - 文件门店数
   - 成功匹配门店数
   - 跳过门店数
   - 成功导入车型目标数
   - 异常记录数
7. 支持覆盖同月份同门店同车型目标。

### 导入解析规则

1. 以 `店编号` 作为唯一匹配字段。
2. `店简称` 仅做展示和日志辅助。
3. 有 `终端小计` 的车型优先取 `终端小计`。
4. 无 `终端小计` 的车型取 `终端`。
5. 不导入提车、订单、子车型终端明细。
6. 导入后可保留门店总成交目标，用于校验。

### 检查点

- 上传样例 Excel 后能生成导入摘要。
- 样例中当前门店表外门店被跳过。
- `funnel_sales_targets` 中生成 `月份 x 门店 x 车型` 记录。
- 重复导入同月份目标时结果可控，不生成重复脏数据。

---

## 阶段 3：实际漏斗指标计算

- 状态：已完成
- 目标：生成独立实际指标表。
- 主要文件：
  - `backend/core/duckdb_manager.py`
  - 可新增 `backend/services/funnel_target_service.py`

### 任务

1. 实现 `compute_funnel_metrics(target_month=None)`。
2. 计算线上线索量：
   - `mart_leads.channel_1 = '线上'`
   - `mart_leads.dealer_id` 必须存在于 `mart_dealers`
3. 计算有效线索量：
   - `lead_status = '跟进中'`
4. 计算到店记录数：
   - 来自 `mart_customer_visit`
   - 仅当前门店表内门店
   - 仅线上渠道
5. 计算到店数：
   - 同线索、同门店、同日期去重
   - 不跨日去重
6. 计算成交数：
   - 来自 `mart_online_sales`
   - 当前门店表内门店
   - 排除 `channel_4 = 'APP订单-排产定'`
7. 车型归因：
   - 第一版按映射表转换。
   - 未匹配映射显示 `未映射车型`。
   - 具体字段优先级在阶段 0 确认后固化。
8. 渠道归因：
   - 保留一级到四级渠道。
9. 生成日粒度和月累计表。
10. 输出数据质量统计：
    - 未匹配门店线上线索量
    - 未映射车型记录量

### 检查点

- SQL 能查询某月份全国线上线索量、有效线索量、到店数、成交数。
- 到店数去重规则符合 PRD 示例。
- 当前门店表外线索不进入指标。
- 成交已排除 `APP订单-排产定`。

---

## 阶段 3A：源车型扫描与车型映射配置

- 状态：待开发
- 目标：把车型标准化从“预留能力”升级为正式配置能力，解决成交目标车型、线索车型、到店车型、成交车型无法精确匹配导致门店 x 车型目标和实际指标分离的问题。
- 主要文件：
  - `backend/core/duckdb_manager.py`
  - `backend/app_v2.py`
  - `src/pages/FunnelTargetAnalysis.tsx`
  - 可新增 `src/components/funnel/FunnelModelMappingPanel.tsx`

### 任务

1. 扩展 DuckDB 表结构：
   - 新增 `funnel_model_source_values`
   - 扩展 `funnel_model_mapping`，增加 `source_type`、`source_field`、`source_model_value`、`target_enabled` 等字段。
2. 实现源车型扫描：
   - 从线索源扫描当前漏斗计算使用的线索车型字段。
   - 从到店源扫描当前意向车系编码字段，后续支持切换到转译后的车型字段。
   - 从线上实销源扫描成交车型字段。
   - 从成交目标导入结果扫描目标车型字段。
3. 扫描结果写入 `funnel_model_source_values`：
   - 月份
   - 来源类型
   - 来源字段
   - 原始车型值
   - 出现次数
   - 影响门店数
   - 指标数量
   - 当前标准车型
   - 映射状态
4. 实现车型映射接口：
   - 查询源车型扫描清单
   - 查询映射配置
   - 单条保存映射
   - 批量保存映射
   - 触发重新扫描
5. 改造实际漏斗指标计算：
   - 所有来源先按 `source_type + source_field + source_model_value` 查映射。
   - 已映射时使用标准车型。
   - 未映射时保留原始车型值，并标记 `unmapped_model_flag = true`。
   - 未映射数据仍计入实际总量和分析表。
6. 改造成交目标导入和目标计算：
   - 目标车型也进入源车型扫描。
   - 目标车型映射到标准车型后，才能与实际指标在门店 x 车型表同一行合并。
   - 无成交目标车型保留实际指标，不计算成交倒推。
7. 前端配置页面：
   - 在专题页配置区新增“车型映射配置”。
   - 支持来源类型、映射状态筛选。
   - 展示原始车型值、出现次数、影响门店数、指标数量、当前标准车型、是否参与目标倒推。
   - 支持单条和批量映射。
   - 保存后提示重算当前月份。

### 检查点

- 能扫描出目标文件中的 `i60`、`RT`、`N60` 等目标车型。
- 能扫描出实际线索中的 `AION i60`、`AION RT`、`AION N60` 等车型。
- 配置 `i60 -> AION i60` 后，门店 x 车型表同一行同时出现成交目标和实际指标。
- 未映射车型仍保留在线索、到店、成交总量中。
- 未映射或无成交目标车型不参与成交目标倒推。
- 客流编码如 `AAY7` 可先映射为标准车型；后续客流转译字段上线后可切换扫描字段。

---

## 阶段 4：目标进度与缺口计算

- 状态：需调整
- 目标：把实际值、全国目标、成交目标和转化率合并计算。
- 主要文件：
  - `backend/core/duckdb_manager.py`
  - 可新增 `backend/services/funnel_target_service.py`

### 任务

1. 实现 `compute_funnel_targets(year_month)`。
2. 计算时间进度和数据进度：
   - 时间进度：当前自然日 / 当月自然日总数，用于页面展示。
   - 数据进度：当前数据库内最新线上线索日期 / 当月自然日总数，用于目标达成率、应达到店、缺口、预计月底等目标进度计算。
   - 历史月：100%
3. 全国到店目标分解：
   - 门店线上线索占比 = 门店线上线索量 / 全国线上线索量
   - 门店分解到店目标 = 全国到店目标 x 门店线上线索占比
4. 成交目标倒推：
   - 使用转化率优先级：车型转化率 > 全国统一转化率
   - 成交倒推到店目标 = 成交目标 / 使用转化率
5. 计算缺口、达成率、预计月底到店。
6. 生成状态标签：
   - 正常
   - 轻微滞后
   - 明显滞后
   - 严重滞后
7. 支持目标或转化率变更后重算。

### 检查点

- 无目标配置时接口返回明确缺失配置状态。
- 有目标配置时可计算全国、门店、车型目标进度。
- 时间进度符合自然日口径，数据进度符合最新线上线索日期口径。
- 车型转化率覆盖全国统一转化率。

---

## 阶段 5：后端查询接口

- 状态：已完成
- 目标：提供首页和专题页数据接口。
- 主要文件：
  - `backend/app_v2.py`
  - `backend/auth/service.py`
  - `backend/auth/permissions.py`

### 任务

1. 新增首页摘要接口：
   - `/api/funnel-target/home-summary`
2. 新增专题页接口：
   - `/api/funnel-target/overview`
   - `/api/funnel-target/dealer-models`
   - `/api/funnel-target/org-dealers`
   - `/api/funnel-target/channels`
   - `/api/funnel-target/filter-options`
3. 支持筛选：
   - 月份
   - 大区
   - 战区
   - 门店
   - 车型
   - 渠道
   - 线索运营区域负责人
   - 线索运营-区域支持
4. 支持分页、排序。
5. 新增导出接口。
6. 接入权限点：
   - `funnel_target.view`
   - `funnel_target.home_card`
   - `funnel_target.filter`
   - `funnel_target.export`
   - `funnel_target.config.view`
   - `funnel_target.config.manage`
7. 审计关键操作：
   - 目标配置
   - 转化率配置
   - Excel 导入
   - 导出

### 检查点

- 未登录访问返回 401。
- 无权限访问返回 403。
- 管理员可访问所有接口。
- 首页接口响应时间满足首页加载要求。

---

## 阶段 6：首页模块

- 状态：已完成
- 目标：首页新增「线上线索漏斗目标达成」模块。
- 主要文件：
  - `src/pages/Home.tsx`
  - `src/hooks/useApi.ts`
  - `src/components/funnel/FunnelHomeCard.tsx`

### 任务

1. 新增 `useFunnelHomeSummary` hook。
2. 在首页新增模块位置：
   - 新增线索指标卡片下方
   - 图表区域上方
3. 展示：
   - 当月到店数
   - 全国到店目标
   - 全国到店目标达成率
   - 时间进度
   - 到店目标缺口
   - 成交倒推到店达成率
   - 预计月底到店
   - 滞后大区数
   - 缺口最大大区 Top 3
4. 展示目标和转化率更新时间。
5. 点击进入 `/funnel-target-analysis`。
6. 按 `funnel_target.home_card` 控制可见性。

### 检查点

- 首页模块只展示当月累计。
- 没有目标配置时展示可理解的空状态。
- 点击能进入专题页。
- 无权限用户看不到模块。

---

## 阶段 7：专题页前端

- 状态：需调整
- 目标：将已实现的 `/funnel-target-analysis` 从明细查询页升级为「驾驶舱 + 明细分析 + 配置中心」结构。
- 主要文件：
  - `src/App.tsx`
  - `src/pages/FunnelTargetAnalysis.tsx`
  - `src/components/funnel/*`

### 任务

1. 保留路由：
   - `/funnel-target-analysis`
2. 页面结构调整：
   - 驾驶舱，默认首屏
   - 明细分析，承载门店 x 车型和门店 x 车型 x 渠道
   - 配置中心，承载目标、转化率、车型映射和重算
3. 全局筛选器：
   - 月份
   - 大区
   - 战区
   - 门店
   - 车型
   - 二级渠道
   - 三级渠道
   - 负责人
   - 区域支持
4. 驾驶舱：
   - 核心状态卡
   - 门店状态分布
   - 大区 / 战区汇总
   - 大区 x 门店主表
   - 点击状态、大区、战区、诊断标签后同页联动门店列表
5. 门店 x 车型表：
   - 支持排序
   - 支持从驾驶舱门店列表带入门店筛选
   - 支持点击带入渠道分析
6. 门店 x 车型 x 渠道表：
   - 支持从门店 x 车型表带入门店和车型
   - 支持仅按门店查看全车型渠道明细
7. 配置中心：
   - 从日常驾驶舱视图中收纳配置能力，避免干扰运营查看
8. 导出按钮按权限展示。
9. 目标配置入口按权限展示。

### 检查点

- 默认进入驾驶舱，而不是直接展示明细查询表。
- 页面加载、筛选、分页、排序正常。
- 表格字段与 PRD 一致。
- 点击状态卡、大区、战区、诊断标签可同页刷新门店列表。
- 门店列表可下钻到门店 x 车型。
- 门店 x 车型可下钻到渠道分析。
- 无权限用户无法访问路由。

---

## 阶段 7A：区域负责人驾驶舱

- 状态：待开发
- 目标：新增面向区域负责人的驾驶舱，让用户先看到管理范围内各状态门店数量，再同页定位具体门店。
- 主要文件：
  - `backend/app_v2.py`
  - `backend/core/duckdb_manager.py`
  - `src/pages/FunnelTargetAnalysis.tsx`
  - 可新增 `src/components/funnel/FunnelDashboard.tsx`
  - 可新增 `src/components/funnel/FunnelStatusCards.tsx`
  - 可新增 `src/components/funnel/FunnelRegionSummary.tsx`
  - 可新增 `src/components/funnel/FunnelDealerList.tsx`

### 后端任务

1. 补充门店状态计算字段：
   - `progress_status`
   - `progress_gap_rate`
   - `diagnosis_tags`
   - `config_status`
2. 门店状态口径：
   - 领先：到店目标达成率 - 数据进度 >= 5pct
   - 正常：-5pct <= 到店目标达成率 - 数据进度 < 5pct
   - 轻度落后：-15pct <= 到店目标达成率 - 数据进度 < -5pct
   - 严重落后：到店目标达成率 - 数据进度 < -15pct
   - 配置异常：缺目标、缺转化率或关键映射缺失
3. 新增或扩展驾驶舱接口：
   - `/api/funnel-target/dashboard-summary`
   - `/api/funnel-target/dashboard-regions`
   - `/api/funnel-target/org-dealers`
4. 接口支持筛选：
   - 月份
   - 大区
   - 战区
   - 门店编码 / 门店名称模糊搜索
   - 负责人
   - 区域支持
   - 状态
   - 诊断标签
5. 大区和战区关系从门店表读取，选择大区后只返回对应战区。
6. `filter-options` 继续返回 `lead_ops_owners`，并建议补充每个负责人的门店数，用于前端负责人 Tab 展示。
7. 驾驶舱摘要、区域汇总、门店列表接口均需支持 `lead_ops_owner` 筛选；该筛选表示当前负责人管理范围。

### 前端任务

1. 将 `/funnel-target-analysis` 默认视图改为驾驶舱。
2. 在驾驶舱核心卡片上方新增负责人视角 Tab：
   - 全部
   - 前 8 个区域负责人
   - 更多负责人下拉搜索
   - Tab 展示负责人名称和管理门店数
3. 点击负责人 Tab 后设置 `lead_ops_owner` 筛选，并刷新驾驶舱全部模块：
   - 核心状态卡
   - 状态分布
   - 大区 / 战区汇总
   - 大区 x 门店主表
   - 诊断标签
4. 负责人筛选与大区、战区、门店搜索叠加生效：
   - 先按负责人限定管理范围
   - 再按大区、战区、门店继续缩小范围
5. 顶部展示核心状态卡：
   - 管理门店数
   - 当月到店数
   - 到店目标达成率
   - 倒推达成率
   - 轻度落后门店数
   - 严重落后门店数
   - 配置异常门店数
6. 增加状态分布条或简洁分布卡。
7. 增加大区 / 战区汇总区。
8. 增加大区 x 门店主表。
9. 点击状态卡、大区、战区、诊断标签后，仅刷新同页门店列表。
10. 门店行提供：
   - 查看车型
   - 查看渠道
   - 查看明细
11. 点击查看车型时切换到明细分析，并带入当前门店筛选。
12. 点击查看渠道时切换到渠道明细，并带入当前门店；若未指定车型，则展示该门店全车型渠道明细。

### 检查点

- 区域负责人可以在一个页面内看到负责范围内各状态门店数量。
- 点击负责人 Tab 后，驾驶舱总数据、状态分布、大区 / 战区汇总和门店列表均切换为该负责人范围。
- 在负责人 Tab 已选中时继续选择大区或战区，数据范围正确叠加。
- 负责人 Tab 展示的门店数与门店表归属关系一致。
- 点击严重落后、轻度落后等状态后，门店列表立即切换为对应门店。
- 点击大区后，门店列表只展示该大区门店。
- 点击战区后，门店列表只展示该战区门店。
- 大区与战区联动关系与门店表一致。
- 门店列表可进入门店 x 车型和渠道明细。

---

## 阶段 8：配置管理前端

- 状态：需扩展
- 目标：提供目标、转化率和车型映射的基础维护能力。
- 主要文件：
  - `src/components/funnel/FunnelConfigPanel.tsx`
  - 可能新增 `src/pages/FunnelTargetConfig.tsx`

### 一期最低方案

1. 支持上传成交目标 Excel。
2. 支持查看导入结果摘要。
3. 支持配置全国到店目标。
4. 支持配置全国统一转化率。
5. 支持配置车型转化率。
6. 支持查看源车型扫描清单。
7. 支持维护车型映射和是否参与目标倒推。
8. 支持保存映射后提示重算。

### 可延后

- 成交目标逐条编辑。
- 导入历史详情页。
- 车型映射操作审计和历史版本回滚。

### 检查点

- 上传样例文件后能显示摘要。
- 配置变更后能触发重算或提示用户刷新。
- 无配置权限用户只能查看，不能编辑。

---

## 阶段 9：导出、审计与权限完整接入

- 状态：部分完成
- 目标：补齐上线所需治理能力。

### 任务

1. 专题页三张表导出：
   - 门店 x 车型
   - 大区/门店列表
   - 门店 x 车型 x 渠道
2. 导出文件名：
   - `线上线索漏斗目标达成_YYYY-MM.xlsx`
3. 操作日志：
   - 查询可不强制记录。
   - 导出、导入、配置保存必须记录。
4. 权限初始化和默认角色授权。
5. 首页和专题页按钮权限控制。

### 检查点

- 导出结果与当前筛选一致。
- 操作日志可查。
- 非授权用户看不到导出和配置按钮。

---

## 阶段 10：测试与验收

- 状态：部分完成
- 目标：完成核心口径、接口、页面和权限验证。

### 后端验证

```bash
python -m py_compile backend/app_v2.py backend/core/duckdb_manager.py backend/auth/*.py
```

如新增服务文件，同步加入编译检查。

### 前端验证

```bash
npm run check
npm run build
```

### 业务口径验收

1. 线上线索量只包含 `一级渠道 = 线上`。
2. 当前门店表外线索不进入全国线索分母。
3. 有效线索只取 `线索状态 = 跟进中`。
4. 到店数按同线索同门店同日去重。
5. 成交排除 `APP订单-排产定`。
6. 全国到店目标按门店线上线索占比分解。
7. 时间进度按自然日。
8. 车型转化率覆盖全国统一转化率。
9. Excel 目标导入只导入当前门店表内门店。
10. 首页只展示当月累计。

---

## 四、字段确认记录

> 阶段 0 完成后补充。

### 4.1 门店表字段

- 当前状态：已确认
- 需确认字段：
  - 线索运营区域负责人：原始 `门店表` 已存在
  - 线索运营-区域支持：原始 `门店表` 已存在

### 4.2 车型字段

- 当前状态：已确认基础字段
- 需确认：
  - 跟进表意向车系编码字段：`跟进表.意向车系`
  - 线索表车型字段优先级：`邀约意向`，为空时使用 `实销车型`
  - 线上实销表车型字段优先级：`实销成交车系`，为空时使用 `邀约后意向车系`、`原始意向车系`

### 4.3 Excel 样例

- 当前状态：已确认并接入导入解析
- 文件：`终端目标样例.xlsx`
- 工作表：`5月目标汇总`
- 多层表头：
  - 基础字段：大区、序号、省份、城市、店编号、主体代码、店简称
  - 合计目标：合计 - 终端目标
  - 车型目标：车型 - 终端 或 车型 - 终端小计

---

## 七、本轮完成记录

- 新增 DuckDB 漏斗主题表和升级方法：`ensure_funnel_schema`
- 原始门店表字段已同步/回填到 `mart_dealers`：
  - `lead_ops_owner`
  - `lead_ops_support`
- 跟进表 `意向车系` 已同步/回填到 `mart_customer_visit.intent_model_code`
- 新增漏斗实际指标计算：
  - 仅线上线索
  - 当前门店表门店范围过滤
  - 有效线索 = 跟进中
  - 到店数 = 同线索同门店同日去重
  - 成交排除 `APP订单-排产定`
- 新增目标进度计算：
  - 全国到店目标按门店线上线索占比分解
  - 成交目标按转化率倒推到店
  - 车型转化率优先于全国统一转化率
- 新增后端接口：
  - 首页摘要
  - 专题页总览
  - 门店 x 车型
  - 大区/门店
  - 门店 x 车型 x 渠道
  - 全国到店目标配置
  - 转化率配置
  - 成交目标 Excel 导入
  - 重算
- 新增权限点并接入路由守卫。
- 首页新增「线上线索漏斗目标达成」模块。
- 新增专题页 `/funnel-target-analysis`。
- 专题页包含基础配置快捷区，可配置全国到店目标、默认转化率并上传成交目标 Excel。

## 八、本轮验证记录

- `python -m py_compile backend/app_v2.py backend/core/duckdb_manager.py backend/auth/*.py`：通过
- `npm run check`：通过
- `npm run build`：通过
- 使用 `/private/tmp/leads_analytics_funnel_test2.db` 临时 DuckDB 副本验证：
  - `ensure_funnel_schema()`：通过
  - `compute_funnel_metrics()`：通过
  - 生成 `funnel_metric_monthly` 43,031 行
  - 生成 `funnel_metric_targets` 6,885 行
  - 已回填运营负责人字段门店 495 家

## 九、当前注意事项

- 真实 `data/leads_analytics.db` 当前被运行中的 Python 进程锁定，验证时未直接写入真实库；已用临时副本完成 SQL 验证。
- 首次正式使用前，需要在后端可写真实 DuckDB 时触发一次重算：
  - 前端专题页点击「重算」，或
  - 调用 `POST /api/funnel-target/recompute`
- 如果现有角色已初始化过，新增权限点需要重新执行认证系统初始化或由管理员在角色页面分配新权限。
- 导出功能和完整配置管理页尚未完成；当前已有专题页快捷配置和目标导入能力。

---

## 五、风险与处理建议

### 5.1 门店范围不一致

风险：线索表、目标文件、门店表门店集合不一致，导致分母偏差。

处理：

- 所有指标以当前门店表为管理边界。
- 记录未匹配门店数据量。
- 目标导入展示跳过门店数。

### 5.2 车型映射不完整

风险：线索、到店、成交、成交目标的车型命名不一致，导致目标和实际指标无法在门店 x 车型表同一行合并；到店来源跟进表的意向车系当前可能仍是编码，后续会转译为车型名称。

处理：

- 新增源车型扫描表，直接展示当前源数据真实存在的车型值。
- 新增车型映射配置，按来源类型、来源字段、原始车型值映射到标准车型。
- 未映射数据不丢弃，仍计入实际总量和明细分析。
- 无成交目标车型不参与成交目标倒推。
- 客流车型字段后续转译时，通过来源字段切换和重新扫描兼容。
- 映射更新后支持重算。

### 5.3 转化率业务含义复杂

风险：成交目标是全渠道终端目标，但实际成交是线上成交。

处理：

- 不新增终端转线上比例。
- 统一由转化率配置承担综合倒推作用。
- 页面展示转化率更新时间和来源。

### 5.4 首页性能

风险：首页新增模块拖慢加载。

处理：

- 首页接口读取预计算摘要。
- 不在首页实时计算明细。

---

## 六、建议实施顺序

1. 阶段 0：字段确认。
2. 阶段 1：表结构。
3. 阶段 2：目标配置和 Excel 导入。
4. 阶段 3A：源车型扫描与车型映射配置。
5. 阶段 3：实际指标计算改造，统一使用标准车型。
6. 阶段 4：目标进度计算调整，按数据进度计算目标达成。
7. 阶段 5：查询接口补充车型映射和配置状态。
8. 阶段 6：首页模块补充数据进度和未映射提示。
9. 阶段 7A：新增区域负责人驾驶舱和同页联动大区 x 门店列表。
10. 阶段 7：调整专题页为驾驶舱、明细分析、配置中心结构。
11. 阶段 8：配置管理前端完善。
12. 阶段 9：导出、审计、权限。
13. 阶段 10：测试验收。
