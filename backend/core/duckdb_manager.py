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
                          "mart_customer_visit", "fact_daily_visit", "report_dealer_daily", "metadata"]
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
                    region_supervisor VARCHAR,
                    region_manager VARCHAR,
                    zone_manager VARCHAR,
                    inspector VARCHAR,
                    is_key_store BOOLEAN,
                    key_store_type VARCHAR,
                    province VARCHAR,
                    source_rowid INTEGER,
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
                    invite_intent VARCHAR,
                    follow2_time TIMESTAMP,
                    follow_cutoff_time TIMESTAMP,
                    raw_assign_time TIMESTAMP,
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

            conn.execute("""
                CREATE TABLE mart_customer_visit (
                    lead_id VARCHAR,
                    dealer_id VARCHAR,
                    visit_time TIMESTAMP,
                    follower_id VARCHAR,
                    follower_role VARCHAR,
                    followup_created_time TIMESTAMP,
                    channel_1 VARCHAR,
                    channel_2 VARCHAR,
                    channel_3 VARCHAR,
                    channel_4 VARCHAR,
                    assign_time TIMESTAMP,
                    follower_name VARCHAR,
                    follower_position VARCHAR,
                    region VARCHAR,
                    zone VARCHAR,
                    dealer_short_name VARCHAR,
                    phone VARCHAR,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
            """)

            conn.execute("""
                CREATE TABLE fact_daily_visit (
                    visit_date DATE,
                    period_type VARCHAR,
                    dealer_id VARCHAR,
                    dealer_name VARCHAR,
                    region VARCHAR,
                    zone VARCHAR,
                    province VARCHAR,
                    channel_1 VARCHAR,
                    channel_2 VARCHAR,
                    visit_count INTEGER,
                    unique_lead_count INTEGER,
                    unique_consultant_count INTEGER,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
            """)

            conn.execute("""
                CREATE TABLE report_dealer_daily (
                    report_date DATE,
                    period_type VARCHAR,
                    dealer_id VARCHAR,
                    dealer_name VARCHAR,
                    region VARCHAR,
                    zone VARCHAR,
                    province VARCHAR,
                    region_manager VARCHAR,
                    zone_manager VARCHAR,
                    inspector VARCHAR,
                    m_n60_lead_count INTEGER,
                    m_n60_follow_30min_count INTEGER,
                    m_lead_count INTEGER,
                    m_follow_30min_count INTEGER,
                    m_follow_30min_rate DOUBLE,
                    m_3day_3follow_task_count INTEGER,
                    m_3day_3follow_count INTEGER,
                    m_3day_3follow_rate DOUBLE,
                    m_valid_lead_count INTEGER,
                    m_valid_lead_rate DOUBLE,
                    m_valid_local_lead_count INTEGER,
                    m_local_lead_count INTEGER,
                    m_to_shop_count INTEGER,
                    m_lead_to_shop_rate DOUBLE,
                    m_local_lead_to_shop_rate DOUBLE,
                    m_valid_lead_to_shop_rate DOUBLE,
                    m_valid_local_lead_to_shop_rate DOUBLE,
                    d_n60_lead_count INTEGER,
                    d_n60_follow_30min_count INTEGER,
                    d_lead_count INTEGER,
                    d_follow_30min_count INTEGER,
                    d_follow_30min_rate DOUBLE,
                    d_3day_3follow_task_count INTEGER,
                    d_3day_3follow_count INTEGER,
                    d_3day_3follow_rate DOUBLE,
                    d_valid_lead_count INTEGER,
                    d_valid_lead_rate DOUBLE,
                    d_valid_local_lead_count INTEGER,
                    d_local_lead_count INTEGER,
                    d_to_shop_count INTEGER,
                    d_lead_to_shop_rate DOUBLE,
                    d_local_lead_to_shop_rate DOUBLE,
                    d_valid_lead_to_shop_rate DOUBLE,
                    d_valid_local_lead_to_shop_rate DOUBLE,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
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
            cursor = sqlite_conn.execute("SELECT rowid, * FROM 门店表")
            dealer_rows = []
            now = datetime.now()
            for row in cursor:
                dealer = dict(zip([d[0] for d in cursor.description], row))
                is_key_store = str(dealer.get("商贸重点店", "否")) == "是"
                dealer_rows.append((
                    dealer["店编号"], dealer["店简称"], dealer["大区"], dealer["战区"],
                    dealer.get("大区督导", ""), dealer["大区经理"], dealer["战区经理"],
                    dealer.get("巡回员", ""),
                    is_key_store, "商贸重点店" if is_key_store else None,
                    None, dealer["rowid"],
                    now, now
                ))

            with duckdb.connect(str(self.db_path)) as conn:
                conn.executemany("""
                    INSERT INTO mart_dealers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, dealer_rows)

                print("Computing province for each dealer from leads data...")
                conn.execute(f"""
                    UPDATE mart_dealers d
                    SET province = sub.province
                    FROM (
                        SELECT dealer_id, province
                        FROM (
                            SELECT dealer_id, province, COUNT(*) as cnt,
                                   ROW_NUMBER() OVER (PARTITION BY dealer_id ORDER BY COUNT(*) DESC) as rn
                            FROM mart_leads
                            WHERE dealer_id IS NOT NULL AND province IS NOT NULL AND TRIM(province) != ''
                            GROUP BY dealer_id, province
                        )
                        WHERE rn = 1
                    ) sub
                    WHERE d.dealer_id = sub.dealer_id
                """)

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
                    TRY_CAST(NULLIF(TRIM(CAST(s."最终下发时间" AS VARCHAR)), '') AS DATE),
                    TRY_CAST(NULLIF(TRIM(CAST(s."最终下发时间" AS VARCHAR)), '') AS TIMESTAMP),
                    TRY_CAST(NULLIF(TRIM(CAST(s."首跟时间" AS VARCHAR)), '') AS DATE),
                    TRY_CAST(NULLIF(TRIM(CAST(s."首跟时间" AS VARCHAR)), '') AS TIMESTAMP),
                    CASE
                        WHEN s."是否及时跟进" = '是' THEN true
                        ELSE false
                    END,
                    TRY_CAST(NULLIF(TRIM(CAST(s."总跟进次数" AS VARCHAR)), '') AS INTEGER),
                    CAST(s."线索状态" AS VARCHAR),
                    CASE WHEN s."实销时间" IS NOT NULL AND TRIM(CAST(s."实销时间" AS VARCHAR)) != '' THEN true ELSE false END,
                    TRY_CAST(NULLIF(TRIM(CAST(s."实销时间" AS VARCHAR)), '') AS DATE),
                    CAST(s."实销车型" AS VARCHAR),
                    CASE
                        WHEN s."实销时间" IS NOT NULL AND TRIM(CAST(s."实销时间" AS VARCHAR)) != ''
                        AND s."最终下发时间" IS NOT NULL AND TRIM(CAST(s."最终下发时间" AS VARCHAR)) != ''
                        THEN datediff('day', TRY_CAST(s."最终下发时间" AS DATE), TRY_CAST(s."实销时间" AS DATE))
                        ELSE NULL
                    END,
                    CASE WHEN s."到店时间" IS NOT NULL AND TRIM(CAST(s."到店时间" AS VARCHAR)) != '' THEN true ELSE false END,
                    CASE WHEN s."试驾时间" IS NOT NULL AND TRIM(CAST(s."试驾时间" AS VARCHAR)) != '' THEN true ELSE false END,
                    CASE WHEN s."下订时间" IS NOT NULL AND TRIM(CAST(s."下订时间" AS VARCHAR)) != '' THEN true ELSE false END,
                    CAST(s."邀约意向" AS VARCHAR),
                    TRY_CAST(NULLIF(TRIM(CAST(s."二跟时间" AS VARCHAR)), '') AS TIMESTAMP),
                    TRY_CAST(NULLIF(TRIM(CAST(s."跟进截止时间" AS VARCHAR)), '') AS TIMESTAMP),
                    TRY_CAST(NULLIF(TRIM(CAST(s."最终下发时间" AS VARCHAR)), '') AS TIMESTAMP),
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                FROM sqlite_scan('{sqlite_path}', '线索表') s
                """
                conn.execute(lead_insert_sql)

                print("Generating date dimension...")
                self._generate_date_dimension(conn, sqlite_conn)

                print("Loading customer visit data...")
                visit_insert_sql = f"""
                INSERT INTO mart_customer_visit
                SELECT
                    CAST(f."门店线索id" AS VARCHAR),
                    CAST(f."门店编码" AS VARCHAR),
                    TRY_CAST(NULLIF(TRIM(CAST(f."进店时间" AS VARCHAR)), '') AS TIMESTAMP),
                    CAST(f."跟进人" AS VARCHAR),
                    CAST(f."跟进人角色" AS VARCHAR),
                    TRY_CAST(NULLIF(TRIM(
                        CASE
                            WHEN f."创建时间" LIKE '%/%' THEN
                                replace(CAST(f."创建时间" AS VARCHAR), '/', '-')
                            ELSE CAST(f."创建时间" AS VARCHAR)
                        END
                    ), '') AS TIMESTAMP),
                    CAST(s."一级渠道" AS VARCHAR),
                    CAST(s."二级渠道" AS VARCHAR),
                    CAST(s."三级渠道" AS VARCHAR),
                    CAST(s."四级渠道" AS VARCHAR),
                    TRY_CAST(NULLIF(TRIM(CAST(s."最终下发时间" AS VARCHAR)), '') AS TIMESTAMP),
                    CAST(p."姓名" AS VARCHAR),
                    CAST(p."岗位" AS VARCHAR),
                    COALESCE(CAST(d."大区" AS VARCHAR), ''),
                    COALESCE(CAST(d."战区" AS VARCHAR), ''),
                    COALESCE(CAST(d."店简称" AS VARCHAR), ''),
                    COALESCE(CAST(s."手机" AS VARCHAR), ''),
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                FROM sqlite_scan('{sqlite_path}', '跟进表') f
                LEFT JOIN sqlite_scan('{sqlite_path}', '线索表') s
                    ON f."门店线索id" = s."id"
                LEFT JOIN sqlite_scan('{sqlite_path}', '人员表') p
                    ON f."跟进人" = p."员工编号"
                LEFT JOIN sqlite_scan('{sqlite_path}', '门店表') d
                    ON f."门店编码" = d."店编号"
                WHERE f."进店时间" IS NOT NULL AND TRIM(CAST(f."进店时间" AS VARCHAR)) != ''
                """
                conn.execute(visit_insert_sql)

                visit_count = conn.execute("SELECT COUNT(*) FROM mart_customer_visit").fetchone()[0]
                print(f"  Customer visit records loaded: {visit_count}")

                print("Computing fact_daily_visit (daily + monthly) ...")
                conn.execute(f"""
                    INSERT INTO fact_daily_visit
                    SELECT 
                        CAST(visit_time AS DATE) as visit_date,
                        'daily' as period_type,
                        m.dealer_id,
                        COALESCE(d.dealer_name, '') as dealer_name,
                        COALESCE(d.region, '') as region,
                        COALESCE(d.zone, '') as zone,
                        COALESCE(d.province, '') as province,
                        COALESCE(m.channel_1, '') as channel_1,
                        COALESCE(m.channel_2, '') as channel_2,
                        COUNT(*) as visit_count,
                        COUNT(DISTINCT m.lead_id) as unique_lead_count,
                        COUNT(DISTINCT CASE WHEN m.follower_name IS NOT NULL AND TRIM(m.follower_name) != '' THEN m.follower_name END) as unique_consultant_count,
                        CURRENT_TIMESTAMP as created_at,
                        CURRENT_TIMESTAMP as updated_at
                    FROM mart_customer_visit m
                    LEFT JOIN mart_dealers d ON m.dealer_id = d.dealer_id
                    GROUP BY CAST(visit_time AS DATE), m.dealer_id, d.dealer_name, d.region, d.zone, d.province, m.channel_1, m.channel_2
                """)

                conn.execute(f"""
                    INSERT INTO fact_daily_visit
                    SELECT 
                        date_trunc('month', CAST(visit_time AS DATE))::DATE as visit_date,
                        'monthly' as period_type,
                        m.dealer_id,
                        COALESCE(d.dealer_name, '') as dealer_name,
                        COALESCE(d.region, '') as region,
                        COALESCE(d.zone, '') as zone,
                        COALESCE(d.province, '') as province,
                        COALESCE(m.channel_1, '') as channel_1,
                        COALESCE(m.channel_2, '') as channel_2,
                        COUNT(*) as visit_count,
                        COUNT(DISTINCT m.lead_id) as unique_lead_count,
                        COUNT(DISTINCT CASE WHEN m.follower_name IS NOT NULL AND TRIM(m.follower_name) != '' THEN m.follower_name END) as unique_consultant_count,
                        CURRENT_TIMESTAMP as created_at,
                        CURRENT_TIMESTAMP as updated_at
                    FROM mart_customer_visit m
                    LEFT JOIN mart_dealers d ON m.dealer_id = d.dealer_id
                    GROUP BY date_trunc('month', CAST(visit_time AS DATE))::DATE, m.dealer_id, d.dealer_name, d.region, d.zone, d.province, m.channel_1, m.channel_2
                """)

                fact_count = conn.execute("SELECT COUNT(*) FROM fact_daily_visit").fetchone()[0]
                print(f"  Fact daily visit records: {fact_count}")

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
                    TRY_CAST(NULLIF(TRIM(CAST(s."最终下发时间" AS VARCHAR)), '') AS DATE),
                    TRY_CAST(NULLIF(TRIM(CAST(s."最终下发时间" AS VARCHAR)), '') AS TIMESTAMP),
                    TRY_CAST(NULLIF(TRIM(CAST(s."首跟时间" AS VARCHAR)), '') AS DATE),
                    TRY_CAST(NULLIF(TRIM(CAST(s."首跟时间" AS VARCHAR)), '') AS TIMESTAMP),
                    CASE
                        WHEN s."是否及时跟进" = '是' THEN true
                        ELSE false
                    END,
                    TRY_CAST(NULLIF(TRIM(CAST(s."总跟进次数" AS VARCHAR)), '') AS INTEGER),
                    CAST(s."线索状态" AS VARCHAR),
                    CASE WHEN s."实销时间" IS NOT NULL AND TRIM(CAST(s."实销时间" AS VARCHAR)) != '' THEN true ELSE false END,
                    TRY_CAST(NULLIF(TRIM(CAST(s."实销时间" AS VARCHAR)), '') AS DATE),
                    CAST(s."实销车型" AS VARCHAR),
                    CASE
                        WHEN s."实销时间" IS NOT NULL AND TRIM(CAST(s."实销时间" AS VARCHAR)) != ''
                        AND s."最终下发时间" IS NOT NULL AND TRIM(CAST(s."最终下发时间" AS VARCHAR)) != ''
                        THEN datediff('day', TRY_CAST(s."最终下发时间" AS DATE), TRY_CAST(s."实销时间" AS DATE))
                        ELSE NULL
                    END,
                    CASE WHEN s."到店时间" IS NOT NULL AND TRIM(CAST(s."到店时间" AS VARCHAR)) != '' THEN true ELSE false END,
                    CASE WHEN s."试驾时间" IS NOT NULL AND TRIM(CAST(s."试驾时间" AS VARCHAR)) != '' THEN true ELSE false END,
                    CASE WHEN s."下订时间" IS NOT NULL AND TRIM(CAST(s."下订时间" AS VARCHAR)) != '' THEN true ELSE false END,
                    CAST(s."邀约意向" AS VARCHAR),
                    TRY_CAST(NULLIF(TRIM(CAST(s."二跟时间" AS VARCHAR)), '') AS TIMESTAMP),
                    TRY_CAST(NULLIF(TRIM(CAST(s."跟进截止时间" AS VARCHAR)), '') AS TIMESTAMP),
                    TRY_CAST(NULLIF(TRIM(CAST(s."最终下发时间" AS VARCHAR)), '') AS TIMESTAMP),
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                FROM sqlite_scan('{sqlite_path}', '线索表') s
                {where_clause}
                """
                conn.execute(lead_insert_sql)

                lead_count_after = conn.execute("SELECT COUNT(*) FROM mart_leads").fetchone()[0]
                new_count = lead_count_after - lead_count_before
                print(f"  New leads added: {new_count}")

                print("Loading incremental customer visit data...")
                visit_where_clause = f"AND s.\"最终下发时间\" > '{last_sync_str}'" if last_sync_str and last_sync_str != 'None' else ""
                visit_insert_sql = f"""
                INSERT INTO mart_customer_visit
                SELECT
                    CAST(f."门店线索id" AS VARCHAR),
                    CAST(f."门店编码" AS VARCHAR),
                    TRY_CAST(NULLIF(TRIM(CAST(f."进店时间" AS VARCHAR)), '') AS TIMESTAMP),
                    CAST(f."跟进人" AS VARCHAR),
                    CAST(f."跟进人角色" AS VARCHAR),
                    TRY_CAST(NULLIF(TRIM(
                        CASE
                            WHEN f."创建时间" LIKE '%/%' THEN
                                replace(CAST(f."创建时间" AS VARCHAR), '/', '-')
                            ELSE CAST(f."创建时间" AS VARCHAR)
                        END
                    ), '') AS TIMESTAMP),
                    CAST(s."一级渠道" AS VARCHAR),
                    CAST(s."二级渠道" AS VARCHAR),
                    CAST(s."三级渠道" AS VARCHAR),
                    CAST(s."四级渠道" AS VARCHAR),
                    TRY_CAST(NULLIF(TRIM(CAST(s."最终下发时间" AS VARCHAR)), '') AS TIMESTAMP),
                    CAST(p."姓名" AS VARCHAR),
                    CAST(p."岗位" AS VARCHAR),
                    COALESCE(CAST(d."大区" AS VARCHAR), ''),
                    COALESCE(CAST(d."战区" AS VARCHAR), ''),
                    COALESCE(CAST(d."店简称" AS VARCHAR), ''),
                    COALESCE(CAST(s."手机" AS VARCHAR), ''),
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                FROM sqlite_scan('{sqlite_path}', '跟进表') f
                LEFT JOIN sqlite_scan('{sqlite_path}', '线索表') s
                    ON f."门店线索id" = s."id"
                LEFT JOIN sqlite_scan('{sqlite_path}', '人员表') p
                    ON f."跟进人" = p."员工编号"
                LEFT JOIN sqlite_scan('{sqlite_path}', '门店表') d
                    ON f."门店编码" = d."店编号"
                WHERE f."进店时间" IS NOT NULL AND TRIM(CAST(f."进店时间" AS VARCHAR)) != ''
                {visit_where_clause}
                """
                conn.execute(visit_insert_sql)

                visit_count = conn.execute("SELECT COUNT(*) FROM mart_customer_visit").fetchone()[0]
                print(f"  Total customer visit records: {visit_count}")

                print("Updating fact_daily_visit for affected dates...")
                conn.execute(f"""
                    DELETE FROM fact_daily_visit
                    WHERE (dealer_id, visit_date) IN (
                        SELECT m.dealer_id, CAST(m.visit_time AS DATE)
                        FROM mart_customer_visit m
                        LEFT JOIN sqlite_scan('{sqlite_path}', '线索表') s ON m.lead_id = CAST(s."id" AS VARCHAR)
                        WHERE s."最终下发时间" > '{last_sync_str}' OR '{last_sync_str}' = 'None'
                    )
                """)

                conn.execute(f"""
                    DELETE FROM fact_daily_visit
                    WHERE (dealer_id, visit_date) IN (
                        SELECT m.dealer_id, date_trunc('month', CAST(m.visit_time AS DATE))::DATE
                        FROM mart_customer_visit m
                        LEFT JOIN sqlite_scan('{sqlite_path}', '线索表') s ON m.lead_id = CAST(s."id" AS VARCHAR)
                        WHERE s."最终下发时间" > '{last_sync_str}' OR '{last_sync_str}' = 'None'
                    ) AND period_type = 'monthly'
                """)

                conn.execute(f"""
                    INSERT INTO fact_daily_visit
                    SELECT 
                        CAST(visit_time AS DATE) as visit_date,
                        'daily' as period_type,
                        m.dealer_id,
                        COALESCE(d.dealer_name, '') as dealer_name,
                        COALESCE(d.region, '') as region,
                        COALESCE(d.zone, '') as zone,
                        COALESCE(d.province, '') as province,
                        COALESCE(m.channel_1, '') as channel_1,
                        COALESCE(m.channel_2, '') as channel_2,
                        COUNT(*) as visit_count,
                        COUNT(DISTINCT m.lead_id) as unique_lead_count,
                        COUNT(DISTINCT CASE WHEN m.follower_name IS NOT NULL AND TRIM(m.follower_name) != '' THEN m.follower_name END) as unique_consultant_count,
                        CURRENT_TIMESTAMP as created_at,
                        CURRENT_TIMESTAMP as updated_at
                    FROM mart_customer_visit m
                    LEFT JOIN mart_dealers d ON m.dealer_id = d.dealer_id
                    WHERE m.dealer_id IN (
                        SELECT m2.dealer_id FROM mart_customer_visit m2
                        LEFT JOIN sqlite_scan('{sqlite_path}', '线索表') s ON m2.lead_id = CAST(s."id" AS VARCHAR)
                        WHERE s."最终下发时间" > '{last_sync_str}' OR '{last_sync_str}' = 'None'
                    )
                    GROUP BY CAST(visit_time AS DATE), m.dealer_id, d.dealer_name, d.region, d.zone, d.province, m.channel_1, m.channel_2
                """)

                conn.execute(f"""
                    INSERT INTO fact_daily_visit
                    SELECT 
                        date_trunc('month', CAST(visit_time AS DATE))::DATE as visit_date,
                        'monthly' as period_type,
                        m.dealer_id,
                        COALESCE(d.dealer_name, '') as dealer_name,
                        COALESCE(d.region, '') as region,
                        COALESCE(d.zone, '') as zone,
                        COALESCE(d.province, '') as province,
                        COALESCE(m.channel_1, '') as channel_1,
                        COALESCE(m.channel_2, '') as channel_2,
                        COUNT(*) as visit_count,
                        COUNT(DISTINCT m.lead_id) as unique_lead_count,
                        COUNT(DISTINCT CASE WHEN m.follower_name IS NOT NULL AND TRIM(m.follower_name) != '' THEN m.follower_name END) as unique_consultant_count,
                        CURRENT_TIMESTAMP as created_at,
                        CURRENT_TIMESTAMP as updated_at
                    FROM mart_customer_visit m
                    LEFT JOIN mart_dealers d ON m.dealer_id = d.dealer_id
                    WHERE m.dealer_id IN (
                        SELECT m2.dealer_id FROM mart_customer_visit m2
                        LEFT JOIN sqlite_scan('{sqlite_path}', '线索表') s ON m2.lead_id = CAST(s."id" AS VARCHAR)
                        WHERE s."最终下发时间" > '{last_sync_str}' OR '{last_sync_str}' = 'None'
                    )
                    GROUP BY date_trunc('month', CAST(visit_time AS DATE))::DATE, m.dealer_id, d.dealer_name, d.region, d.zone, d.province, m.channel_1, m.channel_2
                """)

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

    def refresh_personnel_info(self, sqlite_db_path: Path = RAW_DB_PATH):
        """刷新客流基础表中的人员信息（当人员表更新后调用）"""
        print("Refreshing personnel info in mart_customer_visit...")

        self.close()
        sqlite_conn = None
        try:
            sqlite_conn = sqlite3.connect(str(sqlite_db_path), timeout=30.0)
            sqlite_path = str(sqlite_db_path)

            with duckdb.connect(str(self.db_path)) as conn:
                conn.execute(f"""
                    UPDATE mart_customer_visit v
                    SET follower_name = CAST(p."姓名" AS VARCHAR),
                        follower_position = CAST(p."岗位" AS VARCHAR),
                        updated_at = CURRENT_TIMESTAMP
                    FROM sqlite_scan('{sqlite_path}', '人员表') p
                    WHERE v.follower_id = CAST(p."员工编号" AS VARCHAR)
                """)

                updated = conn.execute("SELECT COUNT(*) FROM mart_customer_visit WHERE follower_name IS NOT NULL").fetchone()[0]
                total = conn.execute("SELECT COUNT(*) FROM mart_customer_visit").fetchone()[0]
                conn.commit()

                print(f"  Personnel info refreshed: {updated}/{total} records have follower info")
        finally:
            if sqlite_conn:
                try:
                    sqlite_conn.close()
                except:
                    pass

    def _generate_date_dimension(self, conn, sqlite_conn):
        """生成日期维度数据"""
        cursor = sqlite_conn.execute("SELECT MIN(DATE(最终下发时间)), MAX(DATE(最终下发时间)) FROM 线索表")
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

            print("Computing dealer daily report...")
            now = datetime.now()
            target_date = date_str if date_str else (now - timedelta(days=1)).strftime("%Y-%m-%d")
            cutoff_time = f"{target_date} 18:00:00"
            cutoff_dt = datetime.strptime(cutoff_time, "%Y-%m-%d %H:%M:%S")
            cutoff_time_72h = (cutoff_dt - timedelta(hours=72)).strftime("%Y-%m-%d %H:%M:%S")
            month_start = f"{now.year}-{now.month:02d}-01"

            conn.execute(f"DELETE FROM report_dealer_daily WHERE period_type = 'daily' AND report_date = DATE '{target_date}'")
            conn.execute(f"DELETE FROM report_dealer_daily WHERE period_type = 'monthly' AND report_date = DATE '{month_start}'")

            conn.execute(f"""
                WITH monthly_base AS (
                    SELECT
                        l.*,
                        d.zone, d.province, d.region_supervisor, d.region_manager, d.zone_manager, d.inspector
                    FROM mart_leads l
                    LEFT JOIN mart_dealers d ON l.dealer_id = d.dealer_id
                    WHERE l.channel_1 = '线上'
                      AND l.dealer_id IN (SELECT dealer_id FROM mart_dealers)
                      AND l.assign_date >= DATE '{month_start}'
                      AND l.assign_date <= DATE '{target_date}'
                ),
                daily_base AS (
                    SELECT * FROM monthly_base
                    WHERE assign_date = DATE '{target_date}'
                ),
                shop_daily AS (
                    SELECT dealer_id, visit_date, SUM(unique_lead_count) as visit_count
                    FROM fact_daily_visit WHERE period_type = 'daily'
                    GROUP BY dealer_id, visit_date
                ),
                shop_monthly AS (
                    SELECT dealer_id, SUM(unique_lead_count) as visit_count
                    FROM fact_daily_visit WHERE period_type = 'monthly'
                    GROUP BY dealer_id
                )
                INSERT INTO report_dealer_daily
                SELECT
                    db.assign_date AS report_date,
                    'daily' AS period_type,
                    db.dealer_id,
                    db.dealer_name,
                    db.region,
                    COALESCE(db.zone, '') AS zone,
                    COALESCE(db.province, '') AS province,
                    COALESCE(db.region_manager, '') AS region_manager,
                    COALESCE(db.zone_manager, '') AS zone_manager,
                    COALESCE(db.inspector, '') AS inspector,

                    0 AS m_n60_lead_count,
                    0 AS m_n60_follow_30min_count,
                    0 AS m_lead_count,
                    0 AS m_follow_30min_count,
                    0.0 AS m_follow_30min_rate,
                    0 AS m_3day_3follow_task_count,
                    0 AS m_3day_3follow_count,
                    0.0 AS m_3day_3follow_rate,
                    0 AS m_valid_lead_count,
                    0.0 AS m_valid_lead_rate,
                    0 AS m_valid_local_lead_count,
                    0 AS m_local_lead_count,
                    0 AS m_to_shop_count,
                    0.0 AS m_lead_to_shop_rate,
                    0.0 AS m_local_lead_to_shop_rate,
                    0.0 AS m_valid_lead_to_shop_rate,
                    0.0 AS m_valid_local_lead_to_shop_rate,

                    SUM(CASE WHEN UPPER(COALESCE(db.invite_intent, '')) LIKE '%N60%' THEN 1 ELSE 0 END) AS d_n60_lead_count,
                    SUM(CASE WHEN UPPER(COALESCE(db.invite_intent, '')) LIKE '%N60%'
                              AND db.is_followed_in_30min THEN 1 ELSE 0 END) AS d_n60_follow_30min_count,

                    COUNT(*) AS d_lead_count,
                    SUM(CASE WHEN db.is_followed_in_30min THEN 1 ELSE 0 END) AS d_follow_30min_count,
                    CASE WHEN COUNT(*) > 0
                        THEN SUM(CASE WHEN db.is_followed_in_30min THEN 1 ELSE 0 END) * 100.0 / COUNT(*)
                        ELSE 0 END AS d_follow_30min_rate,

                    0 AS d_3day_3follow_task_count,
                    0 AS d_3day_3follow_count,
                    0.0 AS d_3day_3follow_rate,

                    SUM(CASE WHEN db.channel_3 != 'APP-试驾'
                              AND db.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END) AS d_valid_lead_count,
                    CASE WHEN COUNT(*) > 0
                        THEN SUM(CASE WHEN db.channel_3 != 'APP-试驾' AND db.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END) * 100.0 /
                             COUNT(*)
                        ELSE 0 END AS d_valid_lead_rate,

                    SUM(CASE WHEN db.channel_3 != 'APP-试驾'
                              AND db.lead_status NOT IN ('异地', '无效')
                              AND db.lead_status != '异地' THEN 1 ELSE 0 END) AS d_valid_local_lead_count,
                    SUM(CASE WHEN db.lead_status != '异地' THEN 1 ELSE 0 END) AS d_local_lead_count,

                    COALESCE(sd.visit_count, 0) AS d_to_shop_count,
                    CASE WHEN COUNT(*) > 0 THEN COALESCE(sd.visit_count, 0) * 100.0 / COUNT(*) ELSE 0 END AS d_lead_to_shop_rate,
                    CASE WHEN SUM(CASE WHEN db.lead_status != '异地' THEN 1 ELSE 0 END) > 0
                        THEN COALESCE(sd.visit_count, 0) * 100.0 / SUM(CASE WHEN db.lead_status != '异地' THEN 1 ELSE 0 END)
                        ELSE 0 END AS d_local_lead_to_shop_rate,
                    CASE WHEN SUM(CASE WHEN db.channel_3 != 'APP-试驾' AND db.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END) > 0
                        THEN COALESCE(sd.visit_count, 0) * 100.0 / SUM(CASE WHEN db.channel_3 != 'APP-试驾' AND db.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END)
                        ELSE 0 END AS d_valid_lead_to_shop_rate,
                    CASE WHEN SUM(CASE WHEN db.channel_3 != 'APP-试驾' AND db.lead_status NOT IN ('异地', '无效') AND db.lead_status != '异地' THEN 1 ELSE 0 END) > 0
                        THEN COALESCE(sd.visit_count, 0) * 100.0 / SUM(CASE WHEN db.channel_3 != 'APP-试驾' AND db.lead_status NOT IN ('异地', '无效') AND db.lead_status != '异地' THEN 1 ELSE 0 END)
                        ELSE 0 END AS d_valid_local_lead_to_shop_rate,

                    CURRENT_TIMESTAMP AS created_at,
                    CURRENT_TIMESTAMP AS updated_at
                FROM daily_base db
                LEFT JOIN shop_daily sd ON db.dealer_id = sd.dealer_id AND db.assign_date = sd.visit_date
                GROUP BY db.assign_date, db.dealer_id, db.dealer_name, db.region, db.zone, db.province, db.region_manager, db.zone_manager, db.inspector, sd.visit_count

                UNION ALL

                SELECT
                    DATE '{month_start}' AS report_date,
                    'monthly' AS period_type,
                    mb.dealer_id,
                    mb.dealer_name,
                    mb.region,
                    COALESCE(mb.zone, '') AS zone,
                    COALESCE(mb.province, '') AS province,
                    COALESCE(mb.region_manager, '') AS region_manager,
                    COALESCE(mb.zone_manager, '') AS zone_manager,
                    COALESCE(mb.inspector, '') AS inspector,

                    SUM(CASE WHEN UPPER(COALESCE(mb.invite_intent, '')) LIKE '%N60%' THEN 1 ELSE 0 END) AS m_n60_lead_count,
                    SUM(CASE WHEN UPPER(COALESCE(mb.invite_intent, '')) LIKE '%N60%'
                              AND mb.is_followed_in_30min THEN 1 ELSE 0 END) AS m_n60_follow_30min_count,

                    COUNT(*) AS m_lead_count,
                    SUM(CASE WHEN mb.is_followed_in_30min THEN 1 ELSE 0 END) AS m_follow_30min_count,
                    CASE WHEN COUNT(*) > 0
                        THEN SUM(CASE WHEN mb.is_followed_in_30min THEN 1 ELSE 0 END) * 100.0 / COUNT(*)
                        ELSE 0 END AS m_follow_30min_rate,

                    COUNT(*) FILTER (
                        WHERE mb.follow_cutoff_time IS NOT NULL
                          AND mb.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                          AND NOT (
                              mb.follow_count = 1
                              AND mb.lead_status = '跟进中'
                              AND mb.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                          )
                    ) AS m_3day_3follow_task_count,

                    SUM(CASE WHEN
                        mb.follow_cutoff_time IS NOT NULL
                        AND mb.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                        AND NOT (
                            mb.follow_count = 1
                            AND mb.lead_status = '跟进中'
                            AND mb.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                        )
                        AND (
                            (mb.follow_count = 1 AND mb.lead_status != '跟进中' AND mb.is_followed_in_30min)
                            OR
                            (mb.follow_count >= 2 AND mb.is_followed_in_30min
                             AND mb.follow2_time IS NOT NULL
                             AND mb.first_follow_time IS NOT NULL
                             AND epoch(mb.follow2_time) - epoch(mb.first_follow_time) < 259200)
                        )
                        THEN 1 ELSE 0 END
                    ) AS m_3day_3follow_count,

                    CASE WHEN COUNT(*) FILTER (
                        WHERE mb.follow_cutoff_time IS NOT NULL
                          AND mb.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                          AND NOT (
                              mb.follow_count = 1
                              AND mb.lead_status = '跟进中'
                              AND mb.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                          )
                    ) > 0
                        THEN SUM(CASE WHEN
                            mb.follow_cutoff_time IS NOT NULL
                            AND mb.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                            AND NOT (
                                mb.follow_count = 1
                                AND mb.lead_status = '跟进中'
                                AND mb.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                            )
                            AND (
                                (mb.follow_count = 1 AND mb.lead_status != '跟进中' AND mb.is_followed_in_30min)
                                OR
                                (mb.follow_count >= 2 AND mb.is_followed_in_30min
                                 AND mb.follow2_time IS NOT NULL
                                 AND mb.first_follow_time IS NOT NULL
                                 AND epoch(mb.follow2_time) - epoch(mb.first_follow_time) < 259200)
                            )
                            THEN 1 ELSE 0 END
                        ) * 100.0 / COUNT(*) FILTER (
                            WHERE mb.follow_cutoff_time IS NOT NULL
                              AND mb.raw_assign_time < TRY_CAST('{cutoff_time}' AS TIMESTAMP)
                              AND NOT (
                                  mb.follow_count = 1
                                  AND mb.lead_status = '跟进中'
                                  AND mb.raw_assign_time >= TRY_CAST('{cutoff_time_72h}' AS TIMESTAMP)
                              )
                        )
                        ELSE 0 END AS m_3day_3follow_rate,

                    SUM(CASE WHEN mb.channel_3 != 'APP-试驾'
                              AND mb.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END) AS m_valid_lead_count,
                    CASE WHEN COUNT(*) > 0
                        THEN SUM(CASE WHEN mb.channel_3 != 'APP-试驾' AND mb.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END) * 100.0 /
                             COUNT(*)
                        ELSE 0 END AS m_valid_lead_rate,

                    SUM(CASE WHEN mb.channel_3 != 'APP-试驾'
                              AND mb.lead_status NOT IN ('异地', '无效')
                              AND mb.lead_status != '异地' THEN 1 ELSE 0 END) AS m_valid_local_lead_count,
                    SUM(CASE WHEN mb.lead_status != '异地' THEN 1 ELSE 0 END) AS m_local_lead_count,

                    COALESCE(sm.visit_count, 0) AS m_to_shop_count,
                    CASE WHEN COUNT(*) > 0 THEN COALESCE(sm.visit_count, 0) * 100.0 / COUNT(*) ELSE 0 END AS m_lead_to_shop_rate,
                    CASE WHEN SUM(CASE WHEN mb.lead_status != '异地' THEN 1 ELSE 0 END) > 0
                        THEN COALESCE(sm.visit_count, 0) * 100.0 / SUM(CASE WHEN mb.lead_status != '异地' THEN 1 ELSE 0 END)
                        ELSE 0 END AS m_local_lead_to_shop_rate,
                    CASE WHEN SUM(CASE WHEN mb.channel_3 != 'APP-试驾' AND mb.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END) > 0
                        THEN COALESCE(sm.visit_count, 0) * 100.0 / SUM(CASE WHEN mb.channel_3 != 'APP-试驾' AND mb.lead_status NOT IN ('异地', '无效') THEN 1 ELSE 0 END)
                        ELSE 0 END AS m_valid_lead_to_shop_rate,
                    CASE WHEN SUM(CASE WHEN mb.channel_3 != 'APP-试驾' AND mb.lead_status NOT IN ('异地', '无效') AND mb.lead_status != '异地' THEN 1 ELSE 0 END) > 0
                        THEN COALESCE(sm.visit_count, 0) * 100.0 / SUM(CASE WHEN mb.channel_3 != 'APP-试驾' AND mb.lead_status NOT IN ('异地', '无效') AND mb.lead_status != '异地' THEN 1 ELSE 0 END)
                        ELSE 0 END AS m_valid_local_lead_to_shop_rate,

                    0 AS d_n60_lead_count, 0 AS d_n60_follow_30min_count,
                    0 AS d_lead_count, 0 AS d_follow_30min_count, 0.0 AS d_follow_30min_rate,
                    0 AS d_3day_3follow_task_count, 0 AS d_3day_3follow_count, 0.0 AS d_3day_3follow_rate,
                    0 AS d_valid_lead_count, 0.0 AS d_valid_lead_rate,
                    0 AS d_valid_local_lead_count, 0 AS d_local_lead_count,
                    0 AS d_to_shop_count, 0.0 AS d_lead_to_shop_rate, 0.0 AS d_local_lead_to_shop_rate, 0.0 AS d_valid_lead_to_shop_rate, 0.0 AS d_valid_local_lead_to_shop_rate,

                    CURRENT_TIMESTAMP AS created_at,
                    CURRENT_TIMESTAMP AS updated_at
                FROM monthly_base mb
                LEFT JOIN shop_monthly sm ON mb.dealer_id = sm.dealer_id
                GROUP BY mb.dealer_id, mb.dealer_name, mb.region, mb.zone, mb.province, mb.region_manager, mb.zone_manager, mb.inspector, sm.visit_count
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
        yesterday_str = yesterday.strftime("%Y-%m-%d")
        yearly_leads = conn.execute("""
            SELECT COUNT(*) FROM mart_leads
            WHERE assign_date >= ? AND channel_1 = '线上'
        """, [year_start]).fetchone()[0]

        month_start = f"{current_year}-{current_month:02d}-01"
        monthly_leads = conn.execute("""
            SELECT COUNT(*) FROM mart_leads
            WHERE assign_date >= ? AND channel_1 = '线上'
        """, [month_start]).fetchone()[0]

        yearly_shop = conn.execute("""
            WITH dealer_visits AS (
                SELECT 
                    f.dealer_id,
                    COUNT(DISTINCT m.lead_id || '_' || CAST(m.visit_time AS DATE)) as online_lead_count
                FROM (
                    SELECT DISTINCT dealer_id, CAST(visit_time AS DATE) as visit_date
                    FROM mart_customer_visit
                    WHERE CAST(visit_time AS DATE) >= ? AND CAST(visit_time AS DATE) <= ? AND channel_1 = '线上'
                ) f
                JOIN mart_customer_visit m ON f.dealer_id = m.dealer_id 
                    AND CAST(m.visit_time AS DATE) = f.visit_date 
                    AND m.channel_1 = '线上'
                GROUP BY f.dealer_id
            )
            SELECT COALESCE(SUM(online_lead_count), 0)
            FROM dealer_visits
        """, [year_start, yesterday_str]).fetchone()[0]

        monthly_shop = conn.execute("""
            WITH dealer_visits AS (
                SELECT 
                    f.dealer_id,
                    COUNT(DISTINCT m.lead_id || '_' || CAST(m.visit_time AS DATE)) as online_lead_count
                FROM (
                    SELECT DISTINCT dealer_id, CAST(visit_time AS DATE) as visit_date
                    FROM mart_customer_visit
                    WHERE CAST(visit_time AS DATE) >= ? AND CAST(visit_time AS DATE) <= ? AND channel_1 = '线上'
                ) f
                JOIN mart_customer_visit m ON f.dealer_id = m.dealer_id 
                    AND CAST(m.visit_time AS DATE) = f.visit_date 
                    AND m.channel_1 = '线上'
                GROUP BY f.dealer_id
            )
            SELECT COALESCE(SUM(online_lead_count), 0)
            FROM dealer_visits
        """, [month_start, yesterday_str]).fetchone()[0]

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
        for i in range(7, 0, -1):
            target_date = (datetime.now() - timedelta(days=i)).date()
            date_str = target_date.strftime("%Y-%m-%d")
            
            # 计算当日到店数（使用和月度总到店量一致的统计逻辑）
            shop_result = conn.execute("""
                WITH dealer_visits AS (
                    SELECT 
                        f.dealer_id,
                        COUNT(DISTINCT m.lead_id || '_' || CAST(m.visit_time AS DATE)) as online_lead_count
                    FROM (
                        SELECT DISTINCT dealer_id, CAST(visit_time AS DATE) as visit_date
                        FROM mart_customer_visit
                        WHERE CAST(visit_time AS DATE) = ? AND channel_1 = '线上'
                    ) f
                    JOIN mart_customer_visit m ON f.dealer_id = m.dealer_id 
                        AND CAST(m.visit_time AS DATE) = f.visit_date 
                        AND m.channel_1 = '线上'
                    GROUP BY f.dealer_id
                )
                SELECT COALESCE(SUM(online_lead_count), 0)
                FROM dealer_visits
            """, [date_str]).fetchone()
            shop_count = shop_result[0] if shop_result and shop_result[0] is not None else 0
            
            # 计算当日线索数（用于计算到店率）
            lead_result = conn.execute("""
                SELECT COUNT(*)
                FROM mart_leads
                WHERE assign_date = ? AND channel_1 = '线上'
            """, [date_str]).fetchone()
            lead_count = lead_result[0] if lead_result and lead_result[0] is not None else 0
            
            # 计算到店率
            shop_rate = round((shop_count * 100.0 / lead_count) if lead_count > 0 else 0.0, 2)

            trend_data.append({
                "date": target_date.strftime("%m-%d"),
                "shop_count": shop_count,
                "shop_rate": shop_rate
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
                    "value": f"{yearly_shop:,}"
                },
                {
                    "name": "monthly_leads",
                    "display_name": "月度总线索量",
                    "value": f"{monthly_leads:,}"
                },
                {
                    "name": "monthly_shop",
                    "display_name": "月度总到店量",
                    "value": f"{monthly_shop:,}"
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
