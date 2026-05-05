# 数据模型设计

## 概述

本文档描述各数据层的数据模型设计。

## 原始数据层 (Raw Data Layer)

### 门店表 (dealer)
直接使用原始数据，不做转换。

| 字段 | 类型 | 说明 |
|------|------|------|
| 大区 | TEXT | |
| 大区督导 | TEXT | |
| 大区经理 | TEXT | |
| 大区副经理 | TEXT | |
| 战区 | TEXT | |
| 战区经理 | TEXT | |
| 巡回员 | TEXT | |
| 店编号 | TEXT | 经销商唯一标识 |
| 店简称 | TEXT | |
| 商贸重点店 | TEXT | |
| 非商贸重点店 | TEXT | |

### 线索表 (lead)
直接使用原始数据，不做转换。

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 线索唯一 ID |
| 手机 | TEXT | 客户手机号码 |
| 跟进截止时间 | TEXT | |
| 是否及时跟进 | TEXT | |
| 下发时间 | TEXT | 线索下发时间 |
| 是否经运营中心 | TEXT | |
| 运营中心邀约时间 | TEXT | |
| 运营中心邀约结果 | TEXT | |
| 状态 | TEXT | |
| 最终下发时间 | TEXT | |
| 一级渠道 | TEXT | |
| 二级渠道 | TEXT | |
| 三级渠道 | TEXT | |
| 四级渠道 | TEXT | |
| 大区 | TEXT | |
| 省份 | TEXT | |
| 城市 | TEXT | |
| 门店 | TEXT | |
| 店简称 | TEXT | |
| 原始意向 | TEXT | |
| 首跟时间 | TEXT | 首次跟进时间 |
| 二跟时间 | TEXT | |
| 三跟时间 | TEXT | |
| 总跟进次数 | TEXT | |
| 线索状态 | TEXT | |
| 邀约意向 | TEXT | |
| 到店时间 | TEXT | |
| 试驾时间 | TEXT | |
| 下订时间 | TEXT | |
| 实销时间 | TEXT | 成交时间 |
| 实销车型 | TEXT | |

---

## 数据集市层 (Mart Layer - DuckDB)

### 线索集市表 (mart_leads)

清洗和丰富后的线索数据。

| 字段 | 类型 | 说明 |
|------|------|------|
| lead_id | VARCHAR | 线索 ID |
| phone | VARCHAR | 手机号码（脱敏） |
| dealer_id | VARCHAR | 店编号 |
| dealer_name | VARCHAR | 店简称 |
| region | VARCHAR | 大区 |
| province | VARCHAR | 省份 |
| city | VARCHAR | 城市 |
| channel_1 | VARCHAR | 一级渠道 |
| channel_2 | VARCHAR | 二级渠道 |
| channel_3 | VARCHAR | 三级渠道 |
| channel_4 | VARCHAR | 四级渠道 |
| assign_date | DATE | 下发日期 |
| assign_time | TIMESTAMP | 下发时间 |
| first_follow_date | DATE | 首跟日期 |
| first_follow_time | TIMESTAMP | 首跟时间 |
| is_followed_in_30min | BOOLEAN | 是否30分钟内跟进 |
| follow_count | INTEGER | 总跟进次数 |
| lead_status | VARCHAR | 线索状态 |
| is_converted | BOOLEAN | 是否转化 |
| conversion_date | DATE | 转化日期 |
| conversion_model | VARCHAR | 转化车型 |
| days_to_convert | INTEGER | 转化天数（从下发到实销） |
| is_to_shop | BOOLEAN | 是否到店 |
| is_test_drive | BOOLEAN | 是否试驾 |
| is_ordered | BOOLEAN | 是否下订 |
| created_at | TIMESTAMP | 数据创建时间 |
| updated_at | TIMESTAMP | 数据更新时间 |

### 经销商集市表 (mart_dealers)

| 字段 | 类型 | 说明 |
|------|------|------|
| dealer_id | VARCHAR | 店编号 |
| dealer_name | VARCHAR | 店简称 |
| region | VARCHAR | 大区 |
| zone | VARCHAR | 战区 |
| region_manager | VARCHAR | 大区经理 |
| zone_manager | VARCHAR | 战区经理 |
| is_key_store | BOOLEAN | 是否重点店 |
| key_store_type | VARCHAR | 重点店类型 |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### 日期维度表 (dim_dates)

| 字段 | 类型 | 说明 |
|------|------|------|
| date_id | DATE | 日期主键 |
| year | INTEGER | 年份 |
| quarter | INTEGER | 季度 |
| month | INTEGER | 月份 |
| week | INTEGER | 周次 |
| day_of_week | INTEGER | 星期几 |
| day_of_month | INTEGER | 日期 |
| is_weekend | BOOLEAN | 是否周末 |
| is_holiday | BOOLEAN | 是否节假日 |

---

## 指标层 (Metric Layer - DuckDB)

### 日粒度指标表 (metric_daily)

按天、经销商、渠道的汇总指标。

| 字段 | 类型 | 说明 |
|------|------|------|
| date_id | DATE | 日期 |
| dealer_id | VARCHAR | 店编号（'all'表示汇总） |
| channel_1 | VARCHAR | 一级渠道（'all'表示汇总） |
| region | VARCHAR | 大区（'all'表示汇总） |
| | | |
| lead_count | INTEGER | 线索数 |
| follow_in_30min_count | INTEGER | 30分钟内跟进数 |
| follow_in_30min_rate | DOUBLE | 30分钟跟进率 |
| to_shop_count | INTEGER | 到店数 |
| to_shop_rate | DOUBLE | 到店率 |
| test_drive_count | INTEGER | 试驾数 |
| test_drive_rate | DOUBLE | 试驾率 |
| order_count | INTEGER | 下订数 |
| conversion_count | INTEGER | 转化数 |
| conversion_rate | DOUBLE | 转化率 |
| avg_days_to_convert | DOUBLE | 平均转化天数 |
| avg_follow_count | DOUBLE | 平均跟进次数 |
| created_at | TIMESTAMP | |

### 周粒度指标表 (metric_weekly)

结构同 metric_daily，按周汇总。

### 月粒度指标表 (metric_monthly)

结构同 metric_daily，按月汇总。

### 经销商排名表 (metric_dealer_ranking)

| 字段 | 类型 | 说明 |
|------|------|------|
| period_type | VARCHAR | 'daily'/'weekly'/'monthly' |
| period_date | DATE | 统计日期 |
| dealer_id | VARCHAR | 店编号 |
| dealer_name | VARCHAR | 店简称 |
| region | VARCHAR | 大区 |
| rank_in_region | INTEGER | 区域排名 |
| rank_all | INTEGER | 总排名 |
| lead_count | INTEGER | 线索数 |
| conversion_count | INTEGER | 转化数 |
| conversion_rate | DOUBLE | 转化率 |
| updated_at | TIMESTAMP | |

### 渠道统计表 (metric_channels)

| 字段 | 类型 | 说明 |
|------|------|------|
| date_id | DATE | 日期 |
| period_type | VARCHAR | 'daily'/'weekly'/'monthly' |
| channel_1 | VARCHAR | 一级渠道 |
| channel_2 | VARCHAR | 二级渠道 |
| lead_count | INTEGER | 线索数 |
| lead_percentage | DOUBLE | 占比 |
| conversion_count | INTEGER | 转化数 |
| conversion_rate | DOUBLE | 转化率 |
| avg_days_to_convert | DOUBLE | 平均转化天数 |

---

## 数据流图

```
原始数据 (leads.db)
       ↓
   [清洗/转换]
       ↓
   数据集市层 (DuckDB)
       ↓
   [聚合/计算]
       ↓
   指标层 (DuckDB)
       ↓
   查询服务
```

## 数据刷新策略

### 全量刷新
- 频率：首次初始化或数据重建时
- 内容：清空并重新填充所有表

### 增量刷新
- 频率：数据更新后（通常是每天）
- 内容：只更新新增日期的数据
- 逻辑：
  1. 检测原始数据中的最新日期
  2. 与指标层中已有的日期对比
  3. 只计算缺失或变更的日期

### 历史回算
- 触发：指标逻辑修改时
- 内容：按需要重新计算历史数据
