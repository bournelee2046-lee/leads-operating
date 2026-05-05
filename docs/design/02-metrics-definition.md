# 指标定义文档

## 概述

本文档定义系统中的业务指标，采用插件化设计，便于扩展和自定义。

## 指标基类

所有指标都继承自 `BaseMetric`，包含以下属性和方法：

```python
class BaseMetric:
    name: str           # 指标唯一标识
    display_name: str    # 显示名称
    description: str   # 描述
    category: str        # 分类 (kpi/analysis)
    granularity: List[str]  # 支持的粒度 (daily/weekly/monthly)
    
    def compute(self, data_source, **kwargs) -> Any:
        # 计算指标值
```

---

## KPI 指标

### 1. 线索数量 (lead_count)
- **名称：线索数量
- **描述：** 统计周期内的线索总数
- **维度：** 时间、经销商、渠道
- **计算逻辑：** `COUNT(DISTINCT lead_id)`
- **示例：** 2026年5月新增线索 12,345 条

### 2. 今日新增线索 (today_leads)
- **名称：** 今日新增线索
- **描述：** 当日下发的线索数
- **计算逻辑：** 当日线索表中的数量，按 date 筛选
- **单位：** 条

### 3. 待跟进线索 (pending_follow)
- **名称：** 待跟进线索
- **描述：** 首跟时间为空的线索数
- **计算逻辑：** `COUNT(WHERE first_follow_time IS NULL OR = '')
- **单位：** 条

### 4. 30分钟内跟进线索 (follow_in_30min)
- **名称：** 30分钟内跟进线索
- **描述：** 下发后30分钟内跟进的线索数
- **计算逻辑：**
  - 计算首次跟进时间 - 下发时间
  - 小于等于 30分钟
- **单位：** 条

### 5. 30分钟跟进率 (follow_in_30min_rate)
- **名称：** 30分钟跟进率
- **描述：** 30分钟内跟进线索占比
- **计算公式：** `follow_in_30min / lead_count
- **单位：** %

### 6. 到店线索 (to_shop_count)
- **名称：** 到店线索
- **描述：** 到店的线索数
- **计算逻辑：** `COUNT(WHERE is_to_shop = TRUE)`

### 7. 到店率 (to_shop_rate)
- **名称：** 到店率
- **描述：** 到店线索占比
- **计算公式：** `to_shop_count / lead_count
- **单位：** %

### 8. 试驾线索 (test_drive_count)
- **名称：** 试驾线索
- **描述：** 试驾的线索数

### 9. 试驾率 (test_drive_rate)
- **名称：** 试驾率
- **描述：** 试驾线索占比

### 10. 转化线索 (conversion_count)
- **名称：** 转化线索
- **描述：** 实销的线索数
- **计算逻辑：** `COUNT(WHERE is_converted = TRUE)`

### 11. 转化率 (conversion_rate)
- **名称：** 转化率
- **描述：** 转化线索占比
- **计算公式：** `conversion_count / lead_count`
- **单位：** %

### 12. 本月转化线索 (month_conversion_count)
- **名称：** 本月转化线索
- **描述：** 本月实销的线索数

### 13. 平均转化天数 (avg_days_to_convert)
- **名称：** 平均转化天数
- **描述：** 从线索下发到实销的平均天数
- **计算逻辑：** `AVG(days_to_convert)`
- **单位：** 天

### 14. 平均跟进次数 (avg_follow_count)
- **名称：** 平均跟进次数
- **描述：** 每条线索的平均跟进次数
- **计算逻辑：** `AVG(follow_count)`

---

## 分析指标

### 1. 线索来源分布 (source_distribution)
- **名称：** 线索来源分布
- **描述：** 按一级渠道统计线索占比
- **计算逻辑：** 按 channel_1 分组统计

### 2. 转化率趋势 (conversion_trend)
- **名称：** 转化率趋势
- **描述：** 转化率的时间序列数据

### 3. 经销商转化率排名 (dealer_conversion_rank)
- **名称：** 经销商转化率排名
- **描述：** 按转化率排序的经销商列表

### 4. 线索状态分布 (lead_status_distribution)
- **名称：** 线索状态分布
- **描述：** 按线索状态的统计
- **计算逻辑：** 按 lead_status 分组

### 5. 渠道转化效果 (channel_conversion_performance)
- **名称：** 渠道转化效果
- **描述：** 各渠道的线索量、转化数、转化率
- **维度：** 一级渠道、二级渠道

### 6. 线索转化漏斗 (conversion_funnel)
- **名称：** 线索转化漏斗
- **描述：** 线索->到店->试驾->下订->成交的转化
- **计算逻辑：** 各阶段的数量和留存率

---

## 自定义指标

### 指标定义格式

```python
class CustomMetric(BaseMetric):
    name = "my_custom_metric"
    display_name = "我的自定义指标"
    description = "指标描述"
    category = "kpi"
    granularity = ["daily", "weekly", "monthly"]
    
    def compute(self, data_source, **kwargs):
        # 计算逻辑
        pass
```

### 自定义指标示例

```python
class HighValueLeadRate(BaseMetric):
    name = "high_value_lead_rate"
    display_name = "高价值线索占比"
    description = "AI评分高的线索占比"
    granularity = ["daily", "weekly"]
    
    def compute(self, data_source, **kwargs):
        # 假设定义 AI评分高的线索占比
        pass
```
