# 风向样本组合管理与量化监测长期方案

## 1. 背景与核心判断

当前「重点店风向监测」的初始思路，是以一批重点门店作为观察样本，通过 T1–T7 指标判断它们与全品牌趋势之间的同步性、背离情况、领先能力和样本稳定性。

但在长期使用中，需要承认一个重要前提：

> 当前选择的重点门店，并不一定在所有业务指标上都具备全品牌代表性。

因此，这套系统不应被设计成「固定 11 家重点店」的静态监测看板，而应该升级为：

> **风向样本组合管理与量化监测系统。**

核心目标是持续寻找、验证、调整一批能够代表或领先全品牌运营趋势的样本门店和业务指标组合。

这套系统借鉴股市量化分析中的「指数成分调整」「因子研究」「组合回测」「调仓机制」等思想，将门店视为可调整的样本资产，将业务指标视为可研究的运营因子。

---

## 2. 从固定重点店到可调仓样本组合

### 2.1 当前方案的可兼容部分

现有 T1–T7 的思想本身是可复用的，因为这些指标本质上衡量的是：

```text
样本组合 vs 全品牌
```

而不是必须限定为：

```text
固定 11 家重点店 vs 全品牌
```

因此，只要将「重点店」抽象为「样本组合」，T1–T7 就可以继续适用。

例如：

- 当前重点店组合；
- 高响应门店组合；
- 新媒体强相关门店组合；
- N60 专项观察组合；
- 到店率先行组合；
- 转化率代表性组合。

这些组合都可以分别计算 T1–T7、Alpha、Beta、Lead IC、信号胜率等指标。

### 2.2 当前方案的不足

如果系统继续按「固定重点店」实现，会有以下长期问题：

1. 样本门店写死，后续调整困难；
2. 一个样本组合被迫适配所有业务指标；
3. 不支持历史版本，组合调整会污染历史口径；
4. 不支持回测，无法证明新组合是否优于旧组合；
5. 指标池固定，后续替换和新增业务指标成本较高；
6. 无法形成类似量化策略中的「组合优化」闭环。

因此，需要将方案升级为配置化、版本化、可回测的长期架构。

---

## 3. 长期定位

建议将模块定位为：

> **风向样本组合管理与监测系统**

而不是单纯的：

> 重点店风向监测

系统核心能力包括：

1. **代表性判断**：样本组合当前是否还能代表全品牌；
2. **领先性判断**：样本组合是否提前释放趋势信号；
3. **稳定性判断**：样本组合是否稳定，还是偶然有效；
4. **信号可信度判断**：某类信号历史上是否靠谱；
5. **风险强度判断**：当前信号是否值得运营干预；
6. **组合调整建议**：哪些门店应加入，哪些门店应剔除；
7. **回测验证**：调整前后组合在历史上的表现对比；
8. **版本追踪**：每次组合调整都可追溯。

---

## 4. 核心设计原则

### 4.1 不相信固定样本，持续验证样本

重点门店不是天然代表全品牌。系统应持续验证：

- 同步性是否下降；
- 领先性是否减弱；
- 跟踪误差是否升高；
- 样本内部是否分化；
- 是否有门店持续拖累组合质量。

### 4.2 门店样本和业务指标解耦

不能假设一批门店适合所有业务指标。

更合理的方式是：

```text
不同业务指标可以绑定不同样本组合
```

示例：

| 业务指标 | 推荐样本组合 |
|---|---|
| 30分钟跟进率 | 高响应门店组合 |
| 三天三次跟进率 | 跟进动作稳定门店组合 |
| 线索有效率 | 线索结构稳定门店组合 |
| 到店率 | 邀约承接稳定门店组合 |
| 转化率 | 高成交承接门店组合 |
| N60跟进率 | N60专项观察组合 |

### 4.3 所有调整必须可回测

每次更换门店或替换指标前，都应回答：

> 新组合在过去 30 / 60 / 90 天内是否优于旧组合？

没有回测验证的样本调整，本质上仍然是经验判断。

### 4.4 组合必须版本化

样本组合调整后，必须保留历史版本。

示例：

```text
组合 V1：2026-04-01 至 2026-05-15
组合 V2：2026-05-16 起生效
```

这样历史监测结果才不会因为样本调整而被重新解释或污染。

### 4.5 系统推荐，人工确认

可以借鉴股市量化中的调仓机制，但不建议完全自动化。

更稳妥的方式是：

```text
系统推荐 → 人工确认 → 版本记录 → 后续验证
```

---

## 5. 样本组合配置体系

### 5.1 样本组合表：config_sample_portfolio

用于定义一个样本组合。

```sql
CREATE TABLE config_sample_portfolio (
    portfolio_id      VARCHAR PRIMARY KEY,
    portfolio_name    VARCHAR NOT NULL,
    portfolio_type    VARCHAR,
    description       VARCHAR,
    is_active         BOOLEAN DEFAULT TRUE,
    current_version   INTEGER DEFAULT 1,
    created_by        VARCHAR,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

示例组合：

| portfolio_id | portfolio_name | 说明 |
|---|---|---|
| P001 | 当前重点店组合 | 默认风向样本组合 V1 |
| P002 | 高响应门店组合 | 用于跟进类指标 |
| P003 | 线索结构稳定组合 | 用于线索有效率 |
| P004 | 到店率先行组合 | 用于到店相关指标 |
| P005 | N60专项组合 | 用于 N60 跟进率 |

### 5.2 样本组合成分表：config_sample_portfolio_members

用于定义组合包含哪些门店、权重、版本和生效时间。

```sql
CREATE TABLE config_sample_portfolio_members (
    portfolio_id      VARCHAR NOT NULL,
    version           INTEGER NOT NULL,
    dealer_id         VARCHAR NOT NULL,
    weight            DOUBLE DEFAULT 1.0,
    effective_from    DATE NOT NULL,
    effective_to      DATE,
    reason            VARCHAR,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (portfolio_id, version, dealer_id)
);
```

关键设计点：

1. **支持权重**：不同门店对组合的贡献可以不同；
2. **支持版本**：每次调样本形成一个新版本；
3. **支持生效时间**：历史计算可以按当时版本还原；
4. **记录原因**：保留加入或剔除门店的业务依据。

---

## 6. 指标配置体系

### 6.1 指标配置表：config_wind_metrics

用于定义哪些业务指标纳入风向监测。

```sql
CREATE TABLE config_wind_metrics (
    metric_key          VARCHAR PRIMARY KEY,
    metric_name_cn      VARCHAR NOT NULL,
    metric_category     VARCHAR,
    direction           VARCHAR DEFAULT 'higher_better',
    formula_id          VARCHAR,
    min_sample_size     INTEGER DEFAULT 8,
    default_window_days INTEGER DEFAULT 7,
    is_active           BOOLEAN DEFAULT TRUE,
    sort_order          INTEGER DEFAULT 0,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

初始指标池：

| metric_key | 指标名称 | 方向 |
|---|---|---|
| follow_in_30min_rate | 30分钟跟进率 | 越高越好 |
| follow_3d_3t_rate | 三天三次跟进率 | 越高越好 |
| lead_valid_rate | 线索有效率 | 越高越好 |
| to_shop_rate | 到店率 | 越高越好 |
| conversion_rate | 转化率 | 越高越好 |
| n60_follow_rate | N60跟进率 | 越高越好 |

### 6.2 指标与样本组合绑定表：config_metric_portfolio_mapping

用于支持不同指标使用不同样本组合。

```sql
CREATE TABLE config_metric_portfolio_mapping (
    metric_key        VARCHAR NOT NULL,
    portfolio_id      VARCHAR NOT NULL,
    portfolio_version INTEGER NOT NULL,
    is_default        BOOLEAN DEFAULT TRUE,
    effective_from    DATE NOT NULL,
    effective_to      DATE,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (metric_key, portfolio_id, portfolio_version, effective_from)
);
```

示例：

| metric_key | portfolio_id | 说明 |
|---|---|---|
| follow_in_30min_rate | P002 | 高响应门店组合 |
| lead_valid_rate | P003 | 线索结构稳定组合 |
| to_shop_rate | P004 | 到店率先行组合 |
| n60_follow_rate | P005 | N60专项组合 |

---

## 7. 量化评价指标体系

在原 T1–T7 基础上，建议增加量化增强指标。

### 7.1 原 T1–T7 的升级方向

| 原指标 | 保留/升级 | 量化增强方向 |
|---|---|---|
| T1 同步率 | 保留 | 增加 Tracking Error，避免只看方向不看幅度 |
| T2 拐点同步率 | 保留 | 使用 MA 交叉和拐点识别增强 |
| T3 趋势斜率比 | 升级 | 使用 Beta / Alpha 替代或补充 |
| T4 趋势背离天数 | 保留 | 增加最大回撤、连续 Alpha 异常 |
| T5 先行指标数 | 重点升级 | 使用 Lead IC、胜率、平均提前天数 |
| T6 趋势稳定性 | 保留 | 增加波动率、Tracking Error、样本离散度 |
| T7 综合趋势得分 | 重构 | 拆分为风向可信度分和预警强度分 |

### 7.2 新增量化指标

| 指标 | 定义 | 业务含义 |
|---|---|---|
| Alpha | 样本组合变化幅度 - 全品牌变化幅度 | 样本是否跑赢或跑输全品牌 |
| Beta | 样本组合对全品牌变化的敏感度 | 样本是否过敏、迟钝或反向 |
| Tracking Error | 样本变化与全品牌变化差值的标准差 | 样本跟踪全品牌是否稳定 |
| Lead IC | 样本今日变化与全品牌未来变化的相关性 | 样本是否具备领先性 |
| Signal Win Rate | 信号发出后，全品牌未来同向变化的比例 | 信号历史命中率 |
| Volatility | 指标日变化率标准差 | 指标是否波动过大 |
| Max Drawdown | 指标从近期高点的最大回落 | 是否出现持续恶化 |
| Momentum | 当前值 - N天前值 | 近期改善或恶化力度 |

---

## 8. 双评分体系

不建议只使用一个综合 T7 分数。长期应拆分为两个分数。

### 8.1 风向可信度分

回答：

> 当前样本组合还能不能代表全品牌？

建议构成：

| 指标 | 权重建议 |
|---|---:|
| T1 同步率 | 25% |
| Tracking Error | 20% |
| Beta 合理性 | 20% |
| T6 稳定性 | 20% |
| A3 样本有效店数 | 15% |

### 8.2 预警强度分

回答：

> 当前是否存在值得提前关注的风险或机会信号？

建议构成：

| 指标 | 权重建议 |
|---|---:|
| T4 背离天数 | 20% |
| T5 先行指标数 | 20% |
| Lead IC | 20% |
| Signal Win Rate | 20% |
| 最大回撤 / 动量恶化 | 20% |

### 8.3 四象限判断

建议在页面上使用四象限表达。

```text
                  预警强度高
                      ↑
        ┌─────────────┬─────────────┐
        │  谨慎观察    │  强预警      │
        │  信号强但样本弱│ 信号强且可信 │
        ├─────────────┼─────────────┤
        │  暂不参考    │  正常跟踪    │
        │  样本弱信号弱 │ 样本可信无风险│
        └─────────────┴─────────────┘
                      →
                 风向可信度高
```

---

## 9. 数据分层设计

### 9.1 每日业务指标行情表：metric_business_daily

这是整个系统的基础行情层。

```sql
CREATE TABLE metric_business_daily (
    calc_date       DATE NOT NULL,
    scope_type      VARCHAR NOT NULL,
    scope_id        VARCHAR NOT NULL,
    metric_key      VARCHAR NOT NULL,
    metric_value    DOUBLE,
    numerator       DOUBLE,
    denominator     DOUBLE,
    sample_count    INTEGER,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (calc_date, scope_type, scope_id, metric_key)
);
```

`scope_type` 支持：

- all_brand；
- dealer；
- portfolio；
- region；
- channel。

### 9.2 风向信号日表：metric_wind_signal_daily

存储每日风向信号和量化指标。

```sql
CREATE TABLE metric_wind_signal_daily (
    calc_date          DATE NOT NULL,
    window_days        INTEGER NOT NULL,
    metric_key         VARCHAR NOT NULL,
    portfolio_id       VARCHAR NOT NULL,
    portfolio_version  INTEGER NOT NULL,

    ks_value           DOUBLE,
    all_value          DOUBLE,
    ks_change          DOUBLE,
    all_change         DOUBLE,

    t1_sync_rate       DOUBLE,
    t2_inflection_sync DOUBLE,
    t3_slope_ratio     DOUBLE,
    t4_diverge_days    INTEGER,
    t5_is_pioneer      BOOLEAN,
    t6_cv              DOUBLE,

    alpha              DOUBLE,
    beta               DOUBLE,
    tracking_error     DOUBLE,
    lead_ic_1d         DOUBLE,
    lead_ic_3d         DOUBLE,
    signal_win_rate    DOUBLE,
    volatility         DOUBLE,
    max_drawdown       DOUBLE,
    momentum           DOUBLE,

    signal_direction   VARCHAR,
    signal_strength    DOUBLE,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (calc_date, window_days, metric_key, portfolio_id, portfolio_version)
);
```

### 9.3 风向评分日表：metric_wind_score_daily

用于首页总览和四象限判断。

```sql
CREATE TABLE metric_wind_score_daily (
    calc_date          DATE NOT NULL,
    window_days        INTEGER NOT NULL,
    portfolio_id       VARCHAR NOT NULL,
    portfolio_version  INTEGER NOT NULL,

    reliability_score  DOUBLE,
    warning_score      DOUBLE,
    composite_score    DOUBLE,
    quadrant           VARCHAR,
    risk_level         VARCHAR,
    main_reason        VARCHAR,

    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (calc_date, window_days, portfolio_id, portfolio_version)
);
```

### 9.4 信号事件表：metric_wind_signal_event

用于记录信号、验证信号和复盘信号。

```sql
CREATE TABLE metric_wind_signal_event (
    event_id              VARCHAR PRIMARY KEY,
    event_date            DATE NOT NULL,
    metric_key            VARCHAR NOT NULL,
    portfolio_id          VARCHAR NOT NULL,
    portfolio_version     INTEGER NOT NULL,

    signal_type           VARCHAR,
    signal_direction      VARCHAR,
    signal_strength       DOUBLE,
    expected_lag_days     INTEGER,

    verified_status       VARCHAR,
    actual_follow_date    DATE,
    actual_follow_change  DOUBLE,
    win_or_loss           VARCHAR,

    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 9.5 组合回测结果表：portfolio_backtest_result

用于对比不同组合的历史表现。

```sql
CREATE TABLE portfolio_backtest_result (
    backtest_id           VARCHAR PRIMARY KEY,
    portfolio_id          VARCHAR NOT NULL,
    portfolio_version     INTEGER NOT NULL,
    metric_key            VARCHAR,
    window_days           INTEGER,
    backtest_start        DATE,
    backtest_end          DATE,

    avg_sync_rate         DOUBLE,
    avg_lead_ic           DOUBLE,
    signal_win_rate       DOUBLE,
    tracking_error        DOUBLE,
    avg_beta              DOUBLE,
    avg_alpha             DOUBLE,
    stability_score       DOUBLE,
    representative_score  DOUBLE,
    leading_score         DOUBLE,
    total_score           DOUBLE,

    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 9.6 组合调整日志表：portfolio_rebalance_log

记录每次样本调整。

```sql
CREATE TABLE portfolio_rebalance_log (
    rebalance_id       VARCHAR PRIMARY KEY,
    portfolio_id       VARCHAR NOT NULL,
    old_version        INTEGER,
    new_version        INTEGER,
    effective_date     DATE NOT NULL,
    added_dealers      VARCHAR,
    removed_dealers    VARCHAR,
    reason             VARCHAR,
    backtest_summary   VARCHAR,
    operator           VARCHAR,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 10. 计算流程

每日数据同步后，建议按以下链路计算：

```text
1. 原始数据同步
   ↓
2. 生成每日业务指标行情 metric_business_daily
   ↓
3. 根据组合配置计算样本组合指标
   ↓
4. 计算技术指标：MA、动量、波动率、最大回撤
   ↓
5. 计算相对指标：Alpha、Beta、Tracking Error
   ↓
6. 计算预测指标：Lead IC、信号胜率、信号收益
   ↓
7. 生成风向信号 metric_wind_signal_daily
   ↓
8. 生成信号事件 metric_wind_signal_event
   ↓
9. 生成风向可信度分、预警强度分
   ↓
10. 前端展示
```

---

## 11. 回测与模拟调仓

### 11.1 回测目标

回测用于回答：

> 如果过去一段时间使用这个样本组合，它是否比当前组合更好？

### 11.2 回测对比维度

| 维度 | 说明 |
|---|---|
| 同步率 | 是否跟全品牌方向一致 |
| Lead IC | 是否具备领先相关性 |
| 信号胜率 | 信号发出后是否被验证 |
| Tracking Error | 跟踪误差是否较低 |
| Beta | 敏感度是否合理 |
| 样本稳定性 | 是否依赖少数门店 |
| 综合评分 | 是否优于旧组合 |

### 11.3 模拟调仓示例

```text
组合 A：当前重点店组合
组合 B：剔除 3 家波动大门店后
组合 C：加入 5 家高 Lead IC 门店后
```

| 组合 | 同步率 | Lead IC | 胜率 | Tracking Error | 综合评分 |
|---|---:|---:|---:|---:|---:|
| A 当前组合 | 72% | 0.31 | 58% | 0.18 | 67 |
| B 剔除噪音 | 79% | 0.36 | 63% | 0.13 | 74 |
| C 加入先行店 | 76% | 0.49 | 71% | 0.16 | 81 |

系统可以据此建议是否调整组合。

---

## 12. 前端页面建议

### 12.1 页面名称

建议从：

```text
重点店风向监测
```

升级为：

```text
风向样本组合监测
```

或：

```text
重点店风向监测（样本组合版）
```

### 12.2 页面核心区块

#### A区：总览判断

展示：

- 当前样本组合；
- 当前组合版本；
- 风向可信度分；
- 预警强度分；
- 四象限状态；
- 主要扣分原因；
- 最近一次组合调整时间。

#### B区：趋势镜面

保留 T1–T6，并增强展示：

- Alpha；
- Beta；
- Tracking Error；
- Lead IC；
- Signal Win Rate。

#### C区：信号事件

展示：

```text
日期 | 业务指标 | 信号类型 | 信号强度 | 历史胜率 | 建议动作
```

示例：

```text
2026-05-03 | 到店率 | 重点店先行转弱 | 高 | 72% | 建议检查渠道质量和门店邀约动作
```

#### D区：趋势图

每个业务指标展示：

- 样本组合线；
- 全品牌线；
- MA3；
- MA7；
- 信号点标记。

#### E区：单店贡献

当组合发出信号时，展示：

- 哪些门店推动信号；
- 哪些门店拖累代表性；
- 哪些门店建议加入或剔除。

#### F区：组合回测

用于比较：

- 当前组合；
- 候选组合；
- 历史版本组合。

---

## 13. 分阶段实施路径

### 第一阶段：配置化改造

目标：

- 抽象样本组合；
- 抽象业务指标；
- 支持组合与指标绑定；
- 当前 11 家重点店作为默认组合 V1。

产出：

- 样本组合配置表；
- 指标配置表；
- 组合成员表；
- 指标组合绑定表。

### 第二阶段：每日行情与基础风向计算

目标：

- 建立 `metric_business_daily`；
- 支持 all_brand、dealer、portfolio 粒度；
- 按组合计算 T1、T3、T4、T6；
- 生成风向可信度分。

### 第三阶段：量化增强指标

目标：

- 计算 Alpha、Beta、Tracking Error；
- 计算动量、波动率、最大回撤；
- 增强 T7 或拆分为双评分。

### 第四阶段：领先性与信号事件

目标：

- 计算 Lead IC；
- 计算信号胜率；
- 生成信号事件；
- 支持信号复盘。

### 第五阶段：组合回测与模拟调仓

目标：

- 支持创建候选组合；
- 支持历史回测；
- 支持旧组合和新组合对比；
- 支持系统给出加入/剔除建议。

### 第六阶段：运营建议与闭环

目标：

- 根据信号类型输出建议动作；
- 记录运营处理结果；
- 将处理效果纳入后续信号评估。

---

## 14. 风险与控制

### 14.1 风险：过度量化，业务难理解

控制方式：

- 后端使用 Alpha、Beta、IC 等量化指标；
- 前端使用业务语言表达；
- 不直接把复杂术语暴露给普通用户。

示例：

| 后端指标 | 前端表达 |
|---|---|
| Alpha | 重点店相对全品牌跑赢/跑输 |
| Beta | 重点店反应敏感度 |
| Tracking Error | 跟踪稳定性 |
| Lead IC | 领先相关性 |
| Signal Win Rate | 历史命中率 |

### 14.2 风险：样本频繁调整导致口径不稳定

控制方式：

- 组合调整必须版本化；
- 每次调整必须记录原因；
- 页面展示当前组合版本；
- 历史数据按历史版本回溯。

### 14.3 风险：小样本噪音过大

控制方式：

- 设置最小有效店数；
- 设置最小线索量门槛；
- 高波动门店降低权重或剔除；
- 使用 7 / 14 / 30 天多窗口验证。

### 14.4 风险：指标失效

控制方式：

- 定期计算指标历史胜率；
- 定期计算 Lead IC；
- 对长期低效指标降权或移除；
- 指标池支持版本化和替换。

---

## 15. 最终结论

如果按「固定重点店」实现，目前方案只能满足短期监测需求，不完全兼容长期发展。

如果升级为：

```text
样本组合配置化
指标池配置化
组合版本化
历史回测
量化信号验证
人工确认调仓
```

则这套方案完全兼容长期需求，并且会从一个普通看板升级为：

> **可持续优化的风向样本组合管理与量化监测平台。**

最终方向应是：

```text
指标池管理
    ↓
样本组合管理
    ↓
组合回测
    ↓
组合生效版本
    ↓
每日风向监测
    ↓
信号预警与复盘
```

一句话总结：

> **不要把门店当固定样本，而要把它当可调仓的样本组合；不要把指标当固定看板字段，而要把它当可研究、可替换的运营因子池。**
