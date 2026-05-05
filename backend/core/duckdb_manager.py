import duckdb
import sqlite3
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime, timedelta
from ..config import DUCKDB_PATH, RAW_DB_PATH


class DuckDBManager:
    """DuckDB 管理器 - 单一数据库"""

    def __init__(self, db_path: Path = DUCKDB_PATH):
        self.db_path = db_path
        self._conn = None

    def get_connection(self):
        """获取连接"""
        if self._conn is None:
            self._conn = duckdb.connect(str(self.db_path))
        return self._conn

    def close(self):
        """关闭连接"""
        if self._conn:
            try:
                self._conn.close()
            except:
                pass
            self._conn = None

    def initialize(self, drop_old: bool = True):
        """初始化所有表"""
        self.close()  # 关闭现有连接
        
        # 使用临时连接进行初始化
        with duckdb.connect(str(self.db_path)) as conn:
            if drop_old:
                tables = ["mart_dealers", "dim_dates", "mart_leads",
                          "metric_daily", "metric_dealer_ranking", "metric_channels",
                          "metadata"]
                for t in tables:
                    conn.execute(f"DROP TABLE IF EXISTS {t}")

            # 创建元数据表
            conn.execute("""
                CREATE TABLE metadata (
                    key VARCHAR PRIMARY KEY,
                    value VARCHAR,
                    updated_at TIMESTAMP
                )
            """)

            # 创建经销商集市表
            conn.execute("""
                CREATE TABLE mart_dealers (
                    dealer_id VARCHAR,
                    dealer_name VARCHAR,
                    region VARCHAR,
                    zone VARCHAR,
                    region_manager VARCHAR,
                    zone_manager VARCHAR,
                    is_key_store BOOLEAN,
                    key_store_type VARCHAR,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
            """)

            # 创建日期维度表
            conn.execute("""
                CREATE TABLE dim_dates (
                    date_id DATE,
                    year INTEGER,
                    quarter INTEGER,
                    month INTEGER,
                    week INTEGER,
                    day_of_week INTEGER,
                    day_of_month INTEGER,
                    is_weekend BOOLEAN,
                    is_holiday BOOLEAN
                )
            """)

            # 创建线索集市表
            conn.execute("""
                CREATE TABLE mart_leads (
                    lead_id VARCHAR,
                    phone VARCHAR,
                    dealer_id VARCHAR,
                    dealer_name VARCHAR,
                    region VARCHAR,
                    province VARCHAR,
                    city VARCHAR,
                    channel_1 VARCHAR,
                    channel_2 VARCHAR,
                    channel_3 VARCHAR,
                    channel_4 VARCHAR,
                    assign_date DATE,
                    assign_time TIMESTAMP,
                    first_follow_date DATE,
                    first_follow_time TIMESTAMP,
                    is_followed_in_30min BOOLEAN,
                    follow_count INTEGER,
                    lead_status VARCHAR,
                    is_converted BOOLEAN,
                    conversion_date DATE,
                    conversion_model VARCHAR,
                    days_to_convert INTEGER,
                    is_to_shop BOOLEAN,
                    is_test_drive BOOLEAN,
                    is_ordered BOOLEAN,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
            """)

            # 日粒度指标表
            conn.execute("""
                CREATE TABLE metric_daily (
                    date_id DATE,
                    dealer_id VARCHAR,
                    channel_1 VARCHAR,
                    region VARCHAR,
                    lead_count INTEGER,
                    follow_in_30min_count INTEGER,
                    follow_in_30min_rate DOUBLE,
                    to_shop_count INTEGER,
                    to_shop_rate DOUBLE,
                    test_drive_count INTEGER,
                    test_drive_rate DOUBLE,
                    order_count INTEGER,
                    conversion_count INTEGER,
                    conversion_rate DOUBLE,
                    avg_days_to_convert DOUBLE,
                    avg_follow_count DOUBLE,
                    created_at TIMESTAMP
                )
            """)

            # 经销商排名表
            conn.execute("""
                CREATE TABLE metric_dealer_ranking (
                    period_type VARCHAR,
                    period_date DATE,
                    dealer_id VARCHAR,
                    dealer_name VARCHAR,
                    region VARCHAR,
                    rank_in_region INTEGER,
                    rank_all INTEGER,
                    lead_count INTEGER,
                    conversion_count INTEGER,
                    conversion_rate DOUBLE,
                    updated_at TIMESTAMP
                )
            """)

            # 渠道统计表
            conn.execute("""
                CREATE TABLE metric_channels (
                    date_id DATE,
                    period_type VARCHAR,
                    channel_1 VARCHAR,
                    channel_2 VARCHAR,
                    lead_count INTEGER,
                    lead_percentage DOUBLE,
                    conversion_count INTEGER,
                    conversion_rate DOUBLE,
                    avg_days_to_convert DOUBLE
                )
            """)

            conn.commit()

    def load_from_sqlite(self, sqlite_db_path: Path = RAW_DB_PATH):
        """从 SQLite 原始数据库加载并转换数据"""
        print("Loading data from SQLite...")

        self.close()  # 关闭现有连接
        sqlite_conn = None
        try:
            sqlite_conn = sqlite3.connect(str(sqlite_db_path), timeout=30.0)
            
            # 获取最新同步时间
            print("Getting latest sync time...")
            cursor = sqlite_conn.execute("SELECT MAX(最终下发时间) FROM 线索表")
            result = cursor.fetchone()
            latest_sync_time = result[0] if result else None

            # 加载经销商数据
            print("Loading dealers...")
            cursor = sqlite_conn.execute("SELECT * FROM 门店表")
            dealer_rows = []
            now = datetime.now()
            for row in cursor:
                dealer = dict(zip([d[0] for d in cursor.description], row))
                is_key_store = str(dealer.get("商贸重点店", "否")) == "是"
                dealer_rows.append((
                    dealer["店编号"],
                    dealer["店简称"],
                    dealer["大区"],
                    dealer["战区"],
                    dealer["大区经理"],
                    dealer["战区经理"],
                    is_key_store,
                    "商贸重点店" if is_key_store else None,
                    now,
                    now
                ))
            
            # 使用临时连接加载数据
            with duckdb.connect(str(self.db_path)) as conn:
                conn.executemany("""
                    INSERT INTO mart_dealers
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, dealer_rows)

                # 加载线索数据
                print("Loading leads...")
                cursor = sqlite_conn.execute("SELECT * FROM 线索表")
                
                batch = []
                batch_size = 5000
                for row in cursor:
                    lead = dict(zip([d[0] for d in cursor.description], row))
                    transformed = self._transform_lead(lead)
                    batch.append(transformed)
                    
                    if len(batch) >= batch_size:
                        conn.executemany("""
                            INSERT INTO mart_leads
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, batch)
                        batch = []
                
                if batch:
                    conn.executemany("""
                        INSERT INTO mart_leads
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, batch)

                # 生成日期维度
                print("Generating date dimension...")
                self._generate_date_dimension(conn, sqlite_conn)

                # 保存最新同步时间和最早数据时间到元数据表
                print("Saving metadata...")
                # 获取最早数据时间
                cursor = sqlite_conn.execute("SELECT MIN(最终下发时间) FROM 线索表")
                earliest_time = cursor.fetchone()[0]
                
                conn.execute("""
                    INSERT INTO metadata (key, value, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                """, ["latest_sync_time", latest_sync_time, now])
                
                conn.execute("""
                    INSERT INTO metadata (key, value, updated_at)
                    VALUES (?, ?, ?)
                    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                """, ["earliest_data_time", earliest_time, now])

                conn.commit()
            print("Data loaded successfully!")
        finally:
            # 确保无论发生什么都关闭SQLite连接
            if sqlite_conn:
                try:
                    sqlite_conn.close()
                except:
                    pass

    def get_metadata(self, key: str):
        """获取元数据"""
        conn = self.get_connection()
        try:
            result = conn.execute("SELECT value FROM metadata WHERE key = ?", [key]).fetchone()
            return result[0] if result else None
        except:
            return None

    def _parse_date(self, s):
        """解析日期字符串"""
        if not s or s == "":
            return None
        try:
            return datetime.strptime(str(s)[:10], "%Y-%m-%d").date()
        except:
            return None

    def _parse_datetime(self, s):
        """解析日期时间字符串"""
        if not s or s == "":
            return None
        try:
            return datetime.strptime(str(s)[:19], "%Y-%m-%d %H:%M:%S")
        except:
            try:
                return datetime.strptime(str(s)[:10], "%Y-%m-%d")
            except:
                return None

    def _transform_lead(self, lead):
        """转换单条线索"""
        now = datetime.now()
        
        assign_time = self._parse_datetime(lead.get("下发时间"))
        first_follow_time = self._parse_datetime(lead.get("首跟时间"))
        conversion_date = self._parse_date(lead.get("实销时间"))
        
        is_followed_in_30min = False
        if assign_time and first_follow_time:
            delta = (first_follow_time - assign_time).total_seconds()
            is_followed_in_30min = delta <= 30 * 60
        
        days_to_convert = None
        if assign_time and conversion_date:
            delta = conversion_date - assign_time.date()
            days_to_convert = delta.days
        
        follow_count = None
        try:
            fc = lead.get("总跟进次数")
            if fc and str(fc).strip() != "":
                follow_count = int(str(fc))
        except:
            pass
        
        return (
            lead.get("id"),
            lead.get("手机"),
            lead.get("门店"),
            lead.get("店简称"),
            lead.get("大区"),
            lead.get("省份"),
            lead.get("城市"),
            lead.get("一级渠道"),
            lead.get("二级渠道"),
            lead.get("三级渠道"),
            lead.get("四级渠道"),
            assign_time.date() if assign_time else None,
            assign_time,
            first_follow_time.date() if first_follow_time else None,
            first_follow_time,
            is_followed_in_30min,
            follow_count,
            lead.get("线索状态"),
            bool(lead.get("实销时间")),
            conversion_date,
            lead.get("实销车型"),
            days_to_convert,
            bool(lead.get("到店时间")),
            bool(lead.get("试驾时间")),
            bool(lead.get("下订时间")),
            now,
            now
        )

    def _generate_date_dimension(self, conn, sqlite_conn):
        """生成日期维度数据"""
        cursor = sqlite_conn.execute("SELECT MIN(DATE(下发时间)), MAX(DATE(下发时间)) FROM 线索表")
        result = cursor.fetchone()
        
        if not result or not result[0] or not result[1]:
            return
            
        try:
            min_date = datetime.strptime(result[0][:10], "%Y-%m-%d").date()
            max_date = datetime.strptime(result[1][:10], "%Y-%m-%d").date()
        except:
            return
        
        date_rows = []
        current = min_date
        while current <= max_date:
            date_rows.append((
                current,
                current.year,
                (current.month - 1) // 3 + 1,
                current.month,
                current.isocalendar()[1],
                current.weekday(),
                current.day,
                current.weekday() >= 5,
                False
            ))
            current += timedelta(days=1)
        
        conn.executemany("INSERT INTO dim_dates VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", date_rows)

    def compute_all_metrics(self, date_str: str = None):
        """计算所有指标"""
        print(f"Computing all metrics for {date_str or 'all dates'}...")

        self.close()
        with duckdb.connect(str(self.db_path)) as conn:
            date_clause = ""
            if date_str:
                date_clause = f" WHERE assign_date = DATE '{date_str}'"

            # 日粒度指标 - 详细维度
            print("Computing daily metrics...")
            conn.execute(f"""
                INSERT INTO metric_daily
                SELECT
                    assign_date AS date_id,
                    dealer_id,
                    channel_1,
                    region,
                    COUNT(*) AS lead_count,
                    SUM(CASE WHEN is_followed_in_30min THEN 1 ELSE 0 END) AS follow_in_30min_count,
                    AVG(CASE WHEN is_followed_in_30min THEN 1 ELSE 0 END) * 100 AS follow_in_30min_rate,
                    SUM(CASE WHEN is_to_shop THEN 1 ELSE 0 END) AS to_shop_count,
                    AVG(CASE WHEN is_to_shop THEN 1 ELSE 0 END) * 100 AS to_shop_rate,
                    SUM(CASE WHEN is_test_drive THEN 1 ELSE 0 END) AS test_drive_count,
                    AVG(CASE WHEN is_test_drive THEN 1 ELSE 0 END) * 100 AS test_drive_rate,
                    SUM(CASE WHEN is_ordered THEN 1 ELSE 0 END) AS order_count,
                    SUM(CASE WHEN is_converted THEN 1 ELSE 0 END) AS conversion_count,
                    AVG(CASE WHEN is_converted THEN 1 ELSE 0 END) * 100 AS conversion_rate,
                    AVG(days_to_convert) AS avg_days_to_convert,
                    AVG(follow_count) AS avg_follow_count,
                    CURRENT_TIMESTAMP AS created_at
                FROM mart_leads
                {date_clause}
                GROUP BY assign_date, dealer_id, channel_1, region
            """)

            # 日粒度指标 - 汇总维度
            conn.execute(f"""
                INSERT INTO metric_daily
                SELECT
                    assign_date AS date_id,
                    'all' AS dealer_id,
                    'all' AS channel_1,
                    'all' AS region,
                    COUNT(*) AS lead_count,
                    SUM(CASE WHEN is_followed_in_30min THEN 1 ELSE 0 END) AS follow_in_30min_count,
                    AVG(CASE WHEN is_followed_in_30min THEN 1 ELSE 0 END) * 100 AS follow_in_30min_rate,
                    SUM(CASE WHEN is_to_shop THEN 1 ELSE 0 END) AS to_shop_count,
                    AVG(CASE WHEN is_to_shop THEN 1 ELSE 0 END) * 100 AS to_shop_rate,
                    SUM(CASE WHEN is_test_drive THEN 1 ELSE 0 END) AS test_drive_count,
                    AVG(CASE WHEN is_test_drive THEN 1 ELSE 0 END) * 100 AS test_drive_rate,
                    SUM(CASE WHEN is_ordered THEN 1 ELSE 0 END) AS order_count,
                    SUM(CASE WHEN is_converted THEN 1 ELSE 0 END) AS conversion_count,
                    AVG(CASE WHEN is_converted THEN 1 ELSE 0 END) * 100 AS conversion_rate,
                    AVG(days_to_convert) AS avg_days_to_convert,
                    AVG(follow_count) AS avg_follow_count,
                    CURRENT_TIMESTAMP AS created_at
                FROM mart_leads
                {date_clause}
                GROUP BY assign_date
            """)

            # 经销商排名
            print("Computing dealer rankings...")
            conn.execute("""
                INSERT INTO metric_dealer_ranking
                SELECT
                    'daily' AS period_type,
                    assign_date AS period_date,
                    dealer_id,
                    dealer_name,
                    region,
                    NULL AS rank_in_region,
                    NULL AS rank_all,
                    COUNT(*) AS lead_count,
                    SUM(CASE WHEN is_converted THEN 1 ELSE 0 END) AS conversion_count,
                    AVG(CASE WHEN is_converted THEN 1 ELSE 0 END) * 100 AS conversion_rate,
                    CURRENT_TIMESTAMP AS updated_at
                FROM mart_leads
                WHERE dealer_id IS NOT NULL
                GROUP BY assign_date, dealer_id, dealer_name, region
            """)

            # 渠道统计
            print("Computing channel statistics...")
            conn.execute("""
                INSERT INTO metric_channels
                WITH daily_stats AS (
                    SELECT
                        assign_date AS date_id,
                        channel_1,
                        channel_2,
                        COUNT(*) AS lead_count,
                        SUM(CASE WHEN is_converted THEN 1 ELSE 0 END) AS conversion_count,
                        AVG(CASE WHEN is_converted THEN 1 ELSE 0 END) * 100 AS conversion_rate,
                        AVG(days_to_convert) AS avg_days_to_convert
                    FROM mart_leads
                    WHERE channel_1 IS NOT NULL
                    GROUP BY assign_date, channel_1, channel_2
                ),
                daily_totals AS (
                    SELECT date_id, SUM(lead_count) AS total_leads
                    FROM daily_stats
                    GROUP BY date_id
                )
                SELECT
                    ds.date_id,
                    'daily' AS period_type,
                    ds.channel_1,
                    ds.channel_2,
                    ds.lead_count,
                    (ds.lead_count * 100.0 / dt.total_leads) AS lead_percentage,
                    ds.conversion_count,
                    ds.conversion_rate,
                    ds.avg_days_to_convert
                FROM daily_stats ds
                JOIN daily_totals dt ON ds.date_id = dt.date_id
            """)

            conn.commit()
            print("Metrics computed!")

    def get_count_stats(self) -> dict:
        """获取统计数"""
        conn = self.get_connection()
        leads = conn.execute("SELECT COUNT(*) FROM mart_leads").fetchone()[0]
        dealers = conn.execute("SELECT COUNT(*) FROM mart_dealers").fetchone()[0]
        metrics = conn.execute("SELECT COUNT(*) FROM metric_daily").fetchone()[0]
        return {
            "leads": leads,
            "dealers": dealers,
            "metrics": metrics
        }

    def get_dashboard_data(self, period: str = "day", date_str: str = None) -> dict:
        """获取仪表盘数据
        period: "day" (昨日数据) or "month" (当月累计数据)
        """
        conn = self.get_connection()

        # 获取最新同步时间和最早数据时间
        latest_sync_time = self.get_metadata('latest_sync_time')
        earliest_data_time = self.get_metadata('earliest_data_time')

        # 计算当前年度和月度
        now = datetime.now()
        current_year = now.year
        current_month = now.month

        # 获取昨日日期
        yesterday = (now - timedelta(days=1)).date()

        # 确定要查询的日期范围
        if period == "month":
            # 当月数据：从月初到昨日
            period_start = f"{current_year}-{current_month:02d}-01"
            period_end = yesterday.strftime("%Y-%m-%d")
            
            # 对比同期：上月相同日期范围（上月月初到上月相同日期）
            if current_month > 1:
                compare_year = current_year
                compare_month = current_month - 1
            else:
                compare_year = current_year - 1
                compare_month = 12
            
            compare_start = f"{compare_year}-{compare_month:02d}-01"
            # 计算上月同期的结束日期（保持相同天数）
            compare_end = yesterday.replace(year=compare_year, month=compare_month).strftime("%Y-%m-%d")
        else:
            # 昨日数据
            period_start = yesterday.strftime("%Y-%m-%d")
            period_end = period_start
            # 对比同期：前天
            compare_start = (now - timedelta(days=2)).strftime("%Y-%m-%d")
            compare_end = compare_start

        # 计算本时段的各项统计
        stats = self._calculate_stats_for_period(conn, period_start, period_end, period)
        
        # 计算对比时段的各项统计
        compare_stats = self._calculate_stats_for_period(conn, compare_start, compare_end, period)

        # 计算增长率
        def calc_growth(current_val, compare_val):
            if compare_val == 0:
                return 0.0
            return (current_val - compare_val) / compare_val

        # 年度总线索量
        year_start = f"{current_year}-01-01"
        yearly_leads = conn.execute("""
            SELECT COUNT(*) FROM mart_leads
            WHERE assign_date >= ? AND channel_1 = '线上'
        """, [year_start]).fetchone()[0]

        # 月度总线索量
        month_start = f"{current_year}-{current_month:02d}-01"
        monthly_leads = conn.execute("""
            SELECT COUNT(*) FROM mart_leads
            WHERE assign_date >= ? AND channel_1 = '线上'
        """, [month_start]).fetchone()[0]

        # 来源分布（线上渠道的子渠道）
        source_dist = conn.execute("""
            SELECT channel_2, COUNT(*) as count
            FROM mart_leads
            WHERE channel_1 = '线上' AND channel_2 IS NOT NULL
            GROUP BY channel_2
            ORDER BY count DESC
            LIMIT 6
        """).fetchall()

        # 趋势数据（最近6周）
        trend_data = []
        for i in range(6):
            week_date = datetime.now() - timedelta(weeks=5-i)
            week_start = week_date - timedelta(days=week_date.weekday())
            week_end = week_start + timedelta(days=6)
            start_str = week_start.strftime("%Y-%m-%d")
            end_str = week_end.strftime("%Y-%m-%d")

            week_stats = conn.execute("""
                SELECT COUNT(*), SUM(CASE WHEN is_converted THEN 1 ELSE 0 END)
                FROM mart_leads
                WHERE assign_date BETWEEN ? AND ? AND channel_1 = '线上'
            """, [start_str, end_str]).fetchone()

            trend_data.append({
                "date": week_start.strftime("%m-%d"),
                "leads": week_stats[0] or 0,
                "conversions": week_stats[1] or 0
            })

        # 经销商排名（线上渠道）
        dealer_ranking = conn.execute("""
            WITH dealer_stats AS (
                SELECT 
                    dealer_id,
                    dealer_name,
                    COUNT(*) as lead_count,
                    SUM(CASE WHEN is_converted THEN 1 ELSE 0 END) as conversion_count,
                    AVG(CASE WHEN is_converted THEN 1 ELSE 0 END) * 100 as conversion_rate
                FROM mart_leads
                WHERE assign_date = (SELECT MAX(assign_date) FROM mart_leads)
                  AND dealer_id IN (SELECT dealer_id FROM mart_dealers)
                  AND channel_1 = '线上'
                GROUP BY dealer_id, dealer_name
            )
            SELECT 
                row_number() OVER (ORDER BY conversion_count DESC) as rk, 
                dealer_id, dealer_name, conversion_count, conversion_rate
            FROM dealer_stats
            ORDER BY conversion_count DESC
            LIMIT 10
        """).fetchall()

        return {
            "latest_sync_time": latest_sync_time,
            "earliest_data_time": earliest_data_time,
            "period": period,
            "kpis": [
                {
                    "name": "yearly_leads",
                    "display_name": "年度总线索量",
                    "value": f"{yearly_leads:,}"
                },
                {
                    "name": "yearly_shop",
                    "display_name": "年度总到店量",
                    "value": "-"
                },
                {
                    "name": "monthly_leads",
                    "display_name": "月度总线索量",
                    "value": f"{monthly_leads:,}"
                },
                {
                    "name": "monthly_shop",
                    "display_name": "月度总到店量",
                    "value": "-"
                }
            ],
            "new_kpis": [
                {
                    "name": "new_total_leads",
                    "display_name": "新增总线索",
                    "value": f"{stats['total_leads']:,}",
                    "change": calc_growth(stats['total_leads'], compare_stats['total_leads']) * 100,
                    "change_label": "环比" if period == "month" else "较前日"
                },
                {
                    "name": "new_valid_leads",
                    "display_name": "新增有效线索",
                    "value": f"{stats['valid_leads']:,}",
                    "change": calc_growth(stats['valid_leads'], compare_stats['valid_leads']) * 100,
                    "change_label": "环比" if period == "month" else "较前日"
                },
                {
                    "name": "new_dealer_leads",
                    "display_name": "新增经销商线索",
                    "value": f"{stats['dealer_leads']:,}",
                    "change": calc_growth(stats['dealer_leads'], compare_stats['dealer_leads']) * 100,
                    "change_label": "环比" if period == "month" else "较前日"
                },
                {
                    "name": "new_dealer_valid_leads",
                    "display_name": "新增经销商有效线索",
                    "value": f"{stats['dealer_valid_leads']:,}",
                    "change": calc_growth(stats['dealer_valid_leads'], compare_stats['dealer_valid_leads']) * 100,
                    "change_label": "环比" if period == "month" else "较前日"
                }
            ],
            "source_distribution": [{"name": s[0], "value": s[1]} for s in source_dist],
            "trend_data": trend_data,
            "dealer_ranking": [
                {
                    "rank": r[0],
                    "dealer_id": r[1],
                    "dealer_name": r[2],
                    "conversion_count": r[3],
                    "conversion_rate": r[4]
                }
                for r in dealer_ranking
            ]
        }

    def _calculate_stats_for_period(self, conn, start_date, end_date, period):
        """计算某个时段的统计数据"""
        if period == "month":
            # 月模式：从开始日期到结束日期
            where_clause = f"assign_date BETWEEN '{start_date}' AND '{end_date}' AND channel_1 = '线上'"
        else:
            # 日模式：单日
            where_clause = f"assign_date = '{start_date}' AND channel_1 = '线上'"

        # 1. 新增总线索
        total_leads = conn.execute(f"""
            SELECT COUNT(*) FROM mart_leads
            WHERE {where_clause}
        """).fetchone()[0]

        # 2. 新增有效线索（排除异地和无效）
        valid_leads = conn.execute(f"""
            SELECT COUNT(*) FROM mart_leads
            WHERE {where_clause}
            AND lead_status NOT IN ('异地', '无效')
        """).fetchone()[0]

        # 3. 新增经销商线索（dealer_id 在 mart_dealers 表中存在的）
        dealer_leads = conn.execute(f"""
            SELECT COUNT(*) FROM mart_leads
            WHERE {where_clause}
            AND dealer_id IN (SELECT dealer_id FROM mart_dealers)
        """).fetchone()[0]

        # 4. 新增经销商有效线索（dealer_id 在 mart_dealers 表中存在且非异地/无效）
        dealer_valid_leads = conn.execute(f"""
            SELECT COUNT(*) FROM mart_leads
            WHERE {where_clause}
            AND dealer_id IN (SELECT dealer_id FROM mart_dealers)
            AND lead_status NOT IN ('异地', '无效')
        """).fetchone()[0]

        return {
            "total_leads": total_leads or 0,
            "valid_leads": valid_leads or 0,
            "dealer_leads": dealer_leads or 0,
            "dealer_valid_leads": dealer_valid_leads or 0
        }
