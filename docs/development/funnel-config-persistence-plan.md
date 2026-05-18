# 漏斗配置数据持久化开发方案

> 背景：DuckDB 重建时 4 张漏斗配置表（成交目标、车型映射、转化率、到店目标）会随 `DROP TABLE IF EXISTS` 被清空  
> 目标：采用方案 B（备份恢复），确保全量重建时配置数据不丢失  
> 编写日期：2026-05-18

---

## 一、文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/core/funnel_config_backup.py` | **新建** | 配置表备份/恢复工具模块 |
| `backend/core/duckdb_manager.py` | **修改** | `initialize()` 拆分 DROP 逻辑，配合备份模块 |
| `backend/app_v2.py` | **修改** | `init_system()` 和 `trigger_refresh()` 集成备份恢复流程 |

---

## 二、影响范围分析

### 2.1 涉及的 4 张配置表

| 表名 | PRIMARY KEY | 列数 | 行数（当前） | 写入者 |
|------|-------------|------|-------------|--------|
| `funnel_national_visit_targets` | `(year_month)` | 6 | ~1 | Web 配置面板 |
| `funnel_sales_targets` | `(year_month, dealer_id, model_name)` | 10 | ~2,328 | Excel 导入 |
| `funnel_conversion_rates` | `(year_month, scope_type, model_name)` | 7 | ~3 | Web 配置面板 |
| `funnel_model_mapping` | `(source_table, source_field, source_model_code)` | 9 | ~9 | Web 配置面板 |

**总数据量** < 3,000 行，备份/恢复耗时 < 100ms，内存占用 < 1MB。

### 2.2 会触发全量重建的入口（需集成备份恢复）

| 入口 | 文件位置 | 触发条件 | 当前行为 |
|------|---------|---------|---------|
| `init_system()` | `app_v2.py:94-109` | DuckDB 文件缺失或 metadata 为空 | 调用 `duck_db.initialize()`，全量 DROP + CREATE |
| `trigger_refresh()` | `app_v2.py:660-662` | 用户传入 `mode='full'` | 调用 `duck_db.initialize()`，全量 DROP + CREATE |

两个入口都需要加上「备份→恢复」包裹。

---

## 三、新模块设计：`backend/core/funnel_config_backup.py`

### 3.1 模块职责

- 从 DuckDB 中读取 4 张配置表的全部数据，序列化到内存
- 在表被 DROP 并重建后，将数据恢复回去
- 处理列名、列顺序、PRIMARY KEY 冲突、空表边界
- 提供事务包裹的安全写入

### 3.2 核心函数

```python
class FunnelConfigBackup:
    """
    漏斗配置表备份/恢复器
    
    生命周期：
      1. backup(conn)   → 从当前 DuckDB 读取 4 张表全量数据存入内存
      2. 执行 initialize() 重建表
      3. restore(conn)  → 将备份数据写回新表
      4. 可选：discard() → 如果不需要恢复，释放内存
    """

    def __init__(self, duck_db: DuckDBManager):
        self._db = duck_db
        self._backup: dict[str, list[dict]] = {}  # table_name -> list of row dicts
        self._table_order = [
            "funnel_national_visit_targets",
            "funnel_sales_targets",
            "funnel_conversion_rates",
            "funnel_model_mapping",
        ]

    def backup(self) -> bool:
        """备份 4 张配置表到内存。成功返回 True。"""

    def restore(self) -> bool:
        """将备份数据 INSERT 回 4 张配置表。使用 INSERT OR REPLACE 处理主键。"""

    def discard(self):
        """释放备份内存。"""

    def has_data(self) -> bool:
        """检查是否有备份数据。"""

    @staticmethod
    def _backup_table(conn, table_name: str) -> list[dict]:
        """读取单张表的所有行，返回 [{col: val, ...}, ...]"""

    @staticmethod
    def _restore_table(conn, table_name: str, rows: list[dict]):
        """将行列表 INSERT OR REPLACE 回指定表。使用列名显式指定。"""
```

### 3.3 关键设计决策

#### 3.3.1 备份格式：列名字典（不是裸元组）

```python
# ✅ 方案：每行存为 {列名: 值} 字典
rows = [{"year_month": "2026-05", "dealer_id": "D001", "sales_target": 50.0}, ...]

# ❌ 不采用：裸元组 SELECT *
# 因为如果表列顺序变了，恢复时数据会错位
```

#### 3.3.2 恢复使用 INSERT OR REPLACE

```sql
INSERT OR REPLACE INTO funnel_sales_targets (year_month, dealer_id, model_name, ...)
VALUES (?, ?, ?, ...)
```

`INSERT OR REPLACE` 在遇到 PRIMARY KEY 冲突时自动替换旧行，避免恢复时因为表中有残留数据而报错。

#### 3.3.3 备份放在 `initialize()` 的 DROP 之前

时序必须是：

```
backup()   →   读取数据（此时表还在）
  ↓
initialize() → DROP TABLE + CREATE TABLE（表已空）
  ↓
load_from_sqlite() + compute_all_metrics()
  ↓
restore()  →  写回数据
```

备份必须在 `initialize()` 之前执行。

---

## 四、`duckdb_manager.py` 修改

### 4.1 `initialize()` 改动

**改动点**：将 `DROP TABLE IF EXISTS` 的配置文件表从删除列表中移除。因为备份/恢复模块会在 `initialize()` 之前备份、之后恢复，`initialize()` 本身不再负责清空配置表。

```python
# 修改前（第 75-78 行）
if drop_old:
    tables = ["mart_dealers", "dim_dates", "mart_leads",
              ...
              "funnel_national_visit_targets",  # 配置表
              "funnel_sales_targets",           # 配置表
              ...]

# 修改后
if drop_old:
    # 计算表（可以安全删除重建）
    compute_tables = [
        "mart_dealers", "dim_dates", "mart_leads",
        "metric_daily", "metric_dealer_ranking", "metric_channels",
        "mart_customer_visit", "fact_daily_visit", "report_dealer_daily",
        "mart_online_sales",
        "funnel_model_source_values",  # 扫描计算值
        "funnel_import_logs",          # 日志
        "funnel_metric_daily",         # compute_funnel_metrics 产出
        "funnel_metric_monthly",       # compute_funnel_metrics 产出
        "funnel_metric_targets",       # compute_funnel_targets 产出
    ]
    for t in compute_tables:
        conn.execute(f"DROP TABLE IF EXISTS {t}")

# 配置表——改为 CREATE TABLE IF NOT EXISTS + 不做 DROP
# funnel_national_visit_targets  CREATE TABLE IF NOT EXISTS
# funnel_sales_targets           CREATE TABLE IF NOT EXISTS
# funnel_conversion_rates        CREATE TABLE IF NOT EXISTS
# funnel_model_mapping           CREATE TABLE IF NOT EXISTS
```

**补充**：4 张配置表的 `CREATE TABLE` 语句改为 `CREATE TABLE IF NOT EXISTS`。这确保了即使表已存在（备份恢复之前重建过），也不会报错，同时也兼容首次创建。

### 4.2 不修改的部分

- `load_from_sqlite()` — 不涉及配置表，不改
- `compute_all_metrics()` — 不涉及配置表，不改  
- `compute_funnel_metrics()` — 写的是 `funnel_metric_daily/monthly` 和 `funnel_metric_targets`（计算表，不在保护范围），不改
- `ensure_funnel_schema()` — 只加列不动数据，不改

---

## 五、`app_v2.py` 修改

### 5.1 `init_system()` 改动

```python
def init_system(force_refresh=False):
    ...
    from backend.core.funnel_config_backup import FunnelConfigBackup

    try:
        data_needs_refresh = force_refresh
        ...

        if data_needs_refresh:
            # ★ 新增：备份配置数据
            config_backup = FunnelConfigBackup(duck_db)
            config_backup.backup()

            duck_db.initialize()
            duck_db.load_from_sqlite()
            duck_db.compute_all_metrics()

            # ★ 新增：恢复配置数据
            if config_backup.has_data():
                config_backup.restore()
            else:
                config_backup.discard()

            print("System initialized successfully!")
        else:
            duck_db.ensure_funnel_schema()
            print("Using existing data!")
        duck_db.close()
    finally:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
        lock_file.close()
```

### 5.2 `trigger_refresh()` 改动

```python
def trigger_refresh():
    ...
    import gc, time
    from backend.core.funnel_config_backup import FunnelConfigBackup

    duck_db.close()
    gc.collect()
    time.sleep(0.3)

    if mode == 'full':
        # ★ 新增：备份配置数据
        config_backup = FunnelConfigBackup(duck_db)
        config_backup.backup()

        duck_db.initialize()
        duck_db.load_from_sqlite()
        duck_db.compute_all_metrics()

        # ★ 新增：恢复配置数据
        if config_backup.has_data():
            config_backup.restore()
        else:
            config_backup.discard()

        stats = duck_db.get_count_stats()
        print(f"Full refresh completed: {stats}")

    elif mode == 'incremental':
        # 增量同步不删除表，不需要备份恢复，不改
        ...

    elif mode == 'recompute':
        # 重算只影响计算表，不改
        ...

    duck_db.close()
    gc.collect()
```

---

## 六、风险应对一览

| # | 风险 | 应对措施 | 验证方式 |
|---|------|---------|---------|
| 1 | 备份恢复窗口期数据丢失 | `initialize()` 中配置表用 `CREATE TABLE IF NOT EXISTS` 而非 `DROP + CREATE`，即使 restore 失败表结构还在 | 模拟 restore 失败后检查表结构 |
| 2 | DuckDB 锁冲突 | backup/restore 复用 `duck_db.get_connection()`，不创建额外 `duckdb.connect()`；backup 在 `close() + gc + sleep(0.3)` 之后调用 | 在线上环境触发一次 full refresh |
| 3 | INSERT 列顺序错乱 | `FunnelConfigBackup._restore_table()` 用 `INSERT OR REPLACE INTO table (col1, col2, ...) VALUES (...)` 显式指定列名 | 单元测试校验列名映射 |
| 4 | PRIMARY KEY 冲突 | 使用 `INSERT OR REPLACE` 而非 `INSERT` | 先插入一条数据再 restore，验证不报错 |
| 5 | 两个入口漏改 | 抽取为 `FunnelConfigBackup` 类，两个入口都用同一个类 | Code review + 全链路测试 |
| 6 | 备份内存 OOM | 备份前统计行数，超过 100,000 行拒绝操作并提示用户 | 模拟大数据量触发阈值 |
| 7 | `load_from_sqlite()` 新连接冲突 | 所有 backup/restore 操作都在 `initialize()` 之前/之后完成，不与 `load_from_sqlite()` 内部的连接共存 | 线上触发一次 full refresh |
| 8 | `init_system()` 锁内超时 | backup + restore 总计 < 1s（数据量 < 3000 行），远小于 Gunicorn 120s timeout | 在线上验证耗时 |

---

## 七、测试验证清单

| # | 测试用例 | 预期结果 |
|---|---------|---------|
| 1 | 首次启动（无 DuckDB 文件）→ init_system | 表创建成功，backup 为空，restore 跳过 |
| 2 | 正常重启（有 DuckDB + metadata）→ ensure_funnel_schema | 不触发 initialize，配置数据保留 |
| 3 | 用户点击「全量刷新」→ trigger_refresh(mode='full') | 4 张配置表数据完整恢复 |
| 4 | 手动删除 leads_analytics.db 后重启 | 配置数据从备份恢复（如果备份文件存在）/ 清空（如果备份文件也删除） |
| 5 | 模拟 backup 成功但 restore 失败 | 4 张表结构存在（空表），不报错，页面显示「暂无配置」 |
| 6 | 配置表无数据时触发 full refresh | backup 为空，restore 跳过，不报错 |
| 7 | `funnel_model_mapping` 有数据 → full refresh → 检查 `target_enabled` 列 | 数值保留不变 |
| 8 | 测试 API：`POST /api/refresh/trigger {"mode":"full"}` | success=True，stats 正常 |

---

## 八、实施步骤

| 步骤 | 操作 | 预计耗时 |
|------|------|---------|
| 1 | 创建 `backend/core/funnel_config_backup.py` | 30 min |
| 2 | 修改 `duckdb_manager.py` initialize()：拆分 DROP 列表 + CREATE TABLE IF NOT EXISTS | 15 min |
| 3 | 修改 `app_v2.py`：init_system() 和 trigger_refresh() 集成备份恢复 | 20 min |
| 4 | 本地 `python3 -m py_compile` 验证 | 1 min |
| 5 | 部署到服务器并重启 | 3 min |
| 6 | 执行全链路测试（清单 1-8） | 15 min |
| 7 | 提交 GitHub | 1 min |
