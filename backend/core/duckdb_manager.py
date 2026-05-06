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
        self.close()

        with duckdb.connect(str(self.db_path)) as conn:
            if drop_old:
                tables = ["mart_dealers", "dim_dates", "mart_leads",
                          "metric_daily", "metric_dealer_ranking", "metric_channels",
                          "metadata"]
                for t in tables:
                    conn.execute(f"DROP TABLE IF EXISTS {t}")

            conn.execute("""
                CREATE TABLE metadata (
                    key VARCHAR PRIMARY KEY,
                    value VARCHAR,
                    updated_at TIMESTAMP
                )
            """)

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
        """从 SQLite 原始数据库加载并转换数据（使用 DuckDB sqlite_scan 直读优化）"""
        print("Loading data from SQLite (DuckDB native reader)...")

        self.close()
        sqlite_conn = None
        try:
            sqlite_conn = sqlite3.connect(str(sqlite_db_path), timeout=30.0)
            sqlite_path = str(sqlite_db_path)

            cursor = sqlite_conn.execute("SELECT MAX(最终下发时间) FROM 线索表")
            latest_sync_time = cursor.fetchone()[0]
            cursor = sqlite_conn.execute("SELECT MIN(最终下发时间) FROM 线索表")
            earliest_data_time = cursor.fetchone()[0]

            print("Loading dealers...")
            cursor = sqlite_conn.execute("SELECT * FROM 门店表")
            dealer_rows = []
            now = datetime.now()
            for row in cursor:
                dealer = dict(zip([d[0] for d in cursor.description], row))
                is_key_store = str(dealer.get("商贸重点店", "否")) == "是"
                dealer_rows.append((
                    dealer["店编号"], dealer["店简称"], dealer["大区"], dealer["战区"],
                    dealer["大区经理"], dealer["战区经理"],
                    is_key_store, "商贸重点店" if is_key_store else None,
                    now, now
                ))

            with duckdb.connect(str(self.db_path)) as conn:
                conn.executemany("""
                    INSERT INTO mart_dealers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, dealer_rows)

                print(f"Loading leads via DuckDB sqlite_scan ({sqlite_path})...")
                lead_insert_sql = f"""
                INSERT INTO mart_leads
                SELECT
                    CAST(s."id" AS VARCHAR),
                    CAST(s."手机" AS VARCHAR),
                    CAST(s."门店" AS VARCHAR),
                    CAST(s."店简称" AS VARCHAR),
                    CAST(s."大区" AS VARCHAR),
                    CAST(s."省份" AS VARCHAR),
                    CAST(s."城市" AS VARCHAR),
                    CAST(s."一级渠道" AS VARCHAR),
                    CAST(s."二级渠道" AS VARCHAR),
                    CAST(s."三级渠道" AS VARCHAR),
                    CAST(s."四级渠道" AS VARCHAR),
                    TRY_CAST(NULLIF(TRIM(CAST(s."下发时间" AS VARCHAR)), '') AS DATE),
                    TRY_CAST(NULLIF(TRIM(CAST(s."下发时间" AS VARCHAR)), '') AS TIMESTAMP),
                    TRY_CAST(NULLIF(TRIM(CAST(s."首跟时间" AS VARCHAR)), '') AS DATE),
                    TRY_CAST(NULLIF(TRIM(CAST(s."首跟时间" AS VARCHAR)), '') AS TIMESTAMP),
                    CASE
                        WHEN s."首跟时间" IS NOT NULL AND s."下发时间" IS NOT NULL
                        AND TRY_CAST(s."首跟时间" AS TIMESTAMP) IS NOT NULL
                        AND TRY_CAST(s."下发时间" AS TIMESTAMP) IS NOT NULL
                        THEN epoch(TRY_CAST(s."首跟时间" AS TIMESTAMP)) - epoch(TRY_CAST(s."下发时间" AS TIMESTAMP)) <= 1800
                        ELSE false
                    END,
                    TRY_CAST(NULLIF(TRIM(CAST(s."总跟进次数" AS VARCHAR)), '') AS INTEGER),
                    CAST(s."线索状态" AS VARCHAR),
                    CASE WHEN s."实销时间" IS NOT NULL AND TRIM(CAST(s."实销时间" AS VARCHAR)) != '' THEN true ELSE false END,
                    TRY_CAST(NULLIF(TRIM(CAST(s."实销时间" AS VARCHAR)), '') AS DATE),
                    CAST(s."实销车型" AS VARCHAR),
                    CASE
                        WHEN s."实销时间" IS NOT NULL AND TRIM(CAST(s."实销时间" AS VARCHAR)) != ''
                        AND s."下发时间" IS NOT NULL AND TRIM(CAST(s."下发时间" AS VARCHAR)) != ''
                        THEN datediff('day', TRY_CAST(s."下发时间" AS DATE), TRY_CAST(s."实销时间" AS DATE))
                        ELSE NULL
                    END,
                    CASE WHEN s."到店时间" IS NOT NULL AND TRIM(CAST(s."到店时间" AS VARCHAR)) != '' THEN true ELSE false END,
                    CASE WHEN s."试驾时间" IS NOT NULL AND TRIM(CAST(s."试驾时间" AS VARCHAR)) != '' THEN true ELSE false END,
                    CASE WHEN s."下订时间" IS NOT NULL AND TRIM(CAST(s."下订时间" AS VARCHAR)) != '' THEN true ELSE false END,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                FROM sqlite_scan('{sqlite_path}', '线索表') s
                """
                conn.execute(lead_insert_sql)

                print("Generating date dimension...")
                self._generate_date_dimension(conn, sqlite_conn)

                print("Saving metadata...")
                now = datetime.now()
                conn.execute("""
                    INSERT INTO metadata (key, value, updated_at)
                    VALUES ('latest_sync_time', ?, ?)
                    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                """, [str(latest_sync_time or ''), now])

                conn.execute("""
                    INSERT INTO metadata (key, value, updated_at)
                    VALUES ('earliest_data_time', ?, ?)
                    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                """, [str(earliest_data_time or ''), now])

                conn.commit()
            print("Data loaded successfully!")
        finally:
            if sqlite_conn:
                try:
                    sqlite_conn.close()
                except:
                    pass

    def load_incremental(self, sqlite_db_path: Path = RAW_DB_PATH):
        """增量加载：仅同步自上次同步之后的新数据"""
        print("Loading incremental data from SQLite...")

        last_sync = self.get_metadata('latest_sync_time')
        last_sync_str = str(last_sync) if last_sync else None
        print(f"  Last sync time: {last_sync_str}")

        self.close()

        sqlite_conn = None
        try:
            sqlite_conn = sqlite3.connect(str(sqlite_db_path), timeout=30.0)
            sqlite_path = str(sqlite_db_path)

            cursor = sqlite_conn.execute("SELECT MAX(最终下发时间) FROM 线索表")
            new_latest_sync = cursor.fetchone()[0]

            if last_sync_str and last_sync_str != 'None':
                where_clause = f"WHERE s.\"最终下发时间\" > '{last_sync_str}'"
            else:
                where_clause = ""

            cursor = sqlite_conn.execute("SELECT MIN(最终下发时间) FROM 线索表")
            new_earliest = cursor.fetchone()[0]

            with duckdb.connect(str(self.db_path)) as conn:
                lead_count_before = conn.execute("SELECT COUNT(*) FROM mart_leads").fetchone()[0]

                lead_insert_sql = f"""
                INSERT INTO mart_leads
                SELECT
                    CAST(s."id" AS VARCHAR),
                    CAST(s."手机" AS VARCHAR),
                    CAST(s."门店" AS VARCHAR),
                    CAST(s."店简称" AS VARCHAR),
                    CAST(s."大区" AS VARCHAR),
                    CAST(s."省份" AS VARCHAR),
                    CAST(s."城市" AS VARCHAR),
                    CAST(s."一级渠道" AS VARCHAR),
                    CAST(s."二级渠道" AS VARCHAR),
                    CAST(s."三级渠道" AS VARCHAR),
                    CAST(s."四级渠道" AS VARCHAR),
                    TRY_CAST(NULLIF(TRIM(CAST(s."下发时间" AS VARCHAR)), '') AS DATE),
                    TRY_CAST(NULLIF(TRIM(CAST(s."下发时间" AS VARCHAR)), '') AS TIMESTAMP),
                    TRY_CAST(NULLIF(TRIM(CAST(s."首跟时间" AS VARCHAR)), '') AS DATE),
                    TRY_CAST(NULLIF(TRIM(CAST(s."首跟时间" AS VARCHAR)), '') AS TIMESTAMP),
                    CASE
                        WHEN s."首跟时间" IS NOT NULL AND s."下发时间" IS NOT NULL
                        AND TRY_CAST(s."首跟时间" AS TIMESTAMP) IS NOT NULL
                        AND TRY_CAST(s."下发时间" AS TIMESTAMP) IS NOT NULL
                        THEN epoch(TRY_CAST(s."首跟时间" AS TIMESTAMP)) - epoch(TRY_CAST(s."下发时间" AS TIMESTAMP)) <= 1800
                        ELSE false
                    END,
                    TRY_CAST(NULLIF(TRIM(CAST(s."总跟进次数" AS VARCHAR)), '') AS INTEGER),
                    CAST(s."线索状态" AS VARCHAR),
                    CASE WHEN s."实销时间" IS NOT NULL AND TRIM(CAST(s."实销时间" AS VARCHAR)) != '' THEN true ELSE false END,
                    TRY_CAST(NULLIF(TRIM(CAST(s."实销时间" AS VARCHAR)), '') AS DATE),
                    CAST(s."实销车型" AS VARCHAR),
                    CASE
                        WHEN s."实销时间" IS NOT NULL AND TRIM(CAST(s."实销时间" AS VARCHAR)) != ''
                        AND s."下发时间" IS NOT NULL AND TRIM(CAST(s."下发时间" AS VARCHAR)) != ''
                        THEN datediff('day', TRY_CAST(s."下发时间" AS DATE), TRY_CAST(s."实销时间" AS DATE))
                        ELSE NULL
                    END,
                    CASE WHEN s."到店时间" IS NOT NULL AND TRIM(CAST(s."到店时间" AS VARCHAR)) != '' THEN true ELSE false END,
                    CASE WHEN s."试驾时间" IS NOT NULL AND TRIM(CAST(s."试驾时间" AS VARCHAR)) != '' THEN true ELSE false END,
                    CASE WHEN s."下订时间" IS NOT NULL AND TRIM(CAST(s."下订时间" AS VARCHAR)) != '' THEN true ELSE false END,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                FROM sqlite_scan('{sqlite_path}', '线索表') s
                {where_clause}
                """
                conn.execute(lead_insert_sql)

                lead_count_after = conn.execute("SELECT COUNT(*) FROM mart_leads").fetchone()[0]
                new_count = lead_count_after - lead_count_before
                print(f"  New leads added: {new_count}")

                now = datetime.now()
                conn.execute("""
                    UPDATE metadata SET value = ?, updated_at = ?
                    WHERE key = 'latest_sync_time'
                """, [str(new_latest_sync or ''), now])

                conn.execute("""
                    UPDATE metadata SET value = ?, updated_at = ?
                    WHERE key = 'earliest_data_time'
                """, [str(new_earliest or ''), now])

                conn.commit()

            print(f"Incremental load completed: {new_count} new rows")
            return new_count
        finally:
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

            # 先清空对应日期的旧指标（全量模式下清空全部）
            if date_str:
                conn.execute(f"DELETE FROM metric_daily WHERE date_id = DATE '{date_str}'")
                conn.execute(f"DELETE FROM metric_dealer_ranking WHERE period_date = DATE '{date_str}'")
                conn.execute(f"DELETE FROM metric_channels WHERE date_id = DATE '{date_str}'")

            print("Computing daily metrics (detail)...")
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

            print("Computing daily metrics (summary)...")
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

            print("Computing dealer rankings...")
            conn.execute(f"""
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
                {date_clause}
                GROUP BY assign_date, dealer_id, dealer_name, region
            """)

            print("Computing channel statistics...")
            conn.execute(f"""
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
                    {date_clause}
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

        latest_sync_time = self.get_metadata('latest_sync_time')
        earliest_data_time = self.get_metadata('earliest_data_time')

        now = datetime.now()
        current_year = now.year
        current_month = now.month

        yesterday = (now - timedelta(days=1)).date()

        if period == "month":
            period_start = f"{current_year}-{current_month:02d}-01"
            period_end = yesterday.strftime("%Y-%m-%d")

            if current_month > 1:
                compare_year = current_year
                compare_month = current_month - 1
            else:
                compare_year = current_year - 1
                compare_month = 12

            compare_start = f"{compare_year}-{compare_month:02d}-01"
            compare_end = yesterday.replace(year=compare_year, month=compare_month).strftime("%Y-%m-%d")
        else:
            period_start = yesterday.strftime("%Y-%m-%d")
            period_end = period_start
            compare_start = (now - timedelta(days=2)).strftime("%Y-%m-%d")
            compare_end = compare_start

        stats = self._calculate_stats_for_period(conn, period_start, period_end, period)
        compare_stats = self._calculate_stats_for_period(conn, compare_start, compare_end, period)

        def calc_growth(current_val, compare_val):
            if compare_val == 0:
                return 0.0
            return (current_val - compare_val) / compare_val

        year_start = f"{current_year}-01-01"
        yearly_leads = conn.execute("""
            SELECT COUNT(*) FROM mart_leads
            WHERE assign_date >= ? AND channel_1 = '线上'
        """, [year_start]).fetchone()[0]

        month_start = f"{current_year}-{current_month:02d}-01"
        monthly_leads = conn.execute("""
            SELECT COUNT(*) FROM mart_leads
            WHERE assign_date >= ? AND channel_1 = '线上'
        """, [month_start]).fetchone()[0]

        source_dist = conn.execute("""
            SELECT 
                channel_2,
                COUNT(*) as count,
                SUM(CASE WHEN lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END) as valid_count,
                CASE WHEN COUNT(*) > 0 THEN SUM(CASE WHEN lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END) * 100.0 / COUNT(*) ELSE 0 END as valid_rate
            FROM mart_leads
            WHERE channel_1 = '线上' AND channel_2 IS NOT NULL
              AND assign_date >= ?
            GROUP BY channel_2
            ORDER BY count DESC
            LIMIT 6
        """, [month_start]).fetchall()

        trend_data = []
        for i in range(6):
            week_date = datetime.now() - timedelta(weeks=5 - i)
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
            "source_distribution": [{"name": s[0], "value": s[1], "valid_count": s[2], "valid_rate": round(s[3], 1)} for s in source_dist],
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
            where_clause = f"assign_date BETWEEN '{start_date}' AND '{end_date}' AND channel_1 = '线上'"
        else:
            where_clause = f"assign_date = '{start_date}' AND channel_1 = '线上'"

        total_leads = conn.execute(f"""
            SELECT COUNT(*) FROM mart_leads WHERE {where_clause}
        """).fetchone()[0]

        valid_leads = conn.execute(f"""
            SELECT COUNT(*) FROM mart_leads
            WHERE {where_clause} AND lead_status NOT IN ('异地', '无效')
        """).fetchone()[0]

        dealer_leads = conn.execute(f"""
            SELECT COUNT(*) FROM mart_leads
            WHERE {where_clause} AND dealer_id IN (SELECT dealer_id FROM mart_dealers)
        """).fetchone()[0]

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
