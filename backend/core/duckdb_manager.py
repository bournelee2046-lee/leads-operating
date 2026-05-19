import duckdb
import sqlite3
import threading
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime, timedelta, date
import calendar
try:
    from ..config import DUCKDB_PATH, RAW_DB_PATH
except ImportError:
    from config import DUCKDB_PATH, RAW_DB_PATH


class DuckDBManager:
    """DuckDB 管理器 - 单一数据库"""

    def __init__(self, db_path: Path = DUCKDB_PATH):
        self.db_path = db_path
        self._local = threading.local()
        self._schema_lock = threading.RLock()
        self._funnel_schema_ready = False

    def get_connection(self):
        """获取当前线程的 DuckDB 连接。"""
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = duckdb.connect(str(self.db_path))
            self._local.conn = conn
        return conn

    def close(self):
        """关闭当前线程的 DuckDB 连接。"""
        conn = getattr(self._local, "conn", None)
        if conn:
            try:
                conn.close()
            except:
                pass
            self._local.conn = None

    def _table_exists(self, conn, table_name: str) -> bool:
        try:
            return bool(conn.execute("""
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = current_schema()
                  AND table_name = ?
            """, [table_name]).fetchone()[0])
        except Exception:
            return False

    def _funnel_schema_tables_exist(self) -> bool:
        conn = self.get_connection()
        required_tables = (
            "funnel_national_visit_targets",
            "funnel_sales_targets",
            "funnel_conversion_rates",
            "funnel_model_mapping",
            "funnel_model_source_values",
            "funnel_import_logs",
            "funnel_metric_daily",
            "funnel_metric_monthly",
            "funnel_metric_targets",
        )
        return all(self._table_exists(conn, table) for table in required_tables)

    def initialize(self, drop_old: bool = True):
        """初始化所有表"""
        self.close()
        self._funnel_schema_ready = False

        conn = self.get_connection()
        try:
            if drop_old:
                compute_tables = ["mart_dealers", "dim_dates", "mart_leads", "mart_dealer_overdue_leads",
                          "metric_daily", "metric_dealer_ranking", "metric_channels",
                          "mart_customer_visit", "fact_daily_visit", "report_dealer_daily", "metadata",
                          "mart_online_sales",
                          "funnel_model_source_values", "funnel_import_logs",
                          "funnel_metric_daily", "funnel_metric_monthly",
                          "funnel_metric_targets"]
                for t in compute_tables:
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
                    lead_ops_owner VARCHAR,
                    lead_ops_support VARCHAR,
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
                CREATE TABLE mart_dealer_overdue_leads (
                    region VARCHAR,
                    zone VARCHAR,
                    dealer_id VARCHAR,
                    dealer_name VARCHAR,
                    lead_id VARCHAR,
                    assign_date DATE,
                    assign_time TIMESTAMP,
                    follow_cutoff_time TIMESTAMP,
                    timely_follow_text VARCHAR,
                    first_follow_time TIMESTAMP,
                    follow2_time TIMESTAMP,
                    follow3_time TIMESTAMP,
                    lead_status VARCHAR,
                    channel_1 VARCHAR,
                    channel_2 VARCHAR,
                    channel_3 VARCHAR,
                    follower VARCHAR,
                    follower_id VARCHAR,
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
                    intent_model_code VARCHAR,
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
                    m_follow_30min_task_count INTEGER,
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
                    d_follow_30min_task_count INTEGER,
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
                    m_new_media_self_valid_lead_count INTEGER,
                    m_new_media_self_lead_count INTEGER,
                    m_online_sales_count INTEGER,
                    m_online_sales_rate DOUBLE,
                    m_to_shop_conversion_rate DOUBLE,
                    m_expected_to_shop DOUBLE,
                    m_to_shop_diff DOUBLE,
                    m_to_shop_eval VARCHAR,
                    d_new_media_self_valid_lead_count INTEGER,
                    d_new_media_self_lead_count INTEGER,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
            """)

            conn.execute("""
                ALTER TABLE report_dealer_daily ADD COLUMN IF NOT EXISTS m_new_media_self_valid_lead_count INTEGER
            """)
            conn.execute("""
                ALTER TABLE report_dealer_daily ADD COLUMN IF NOT EXISTS m_new_media_self_lead_count INTEGER
            """)
            conn.execute("""
                ALTER TABLE report_dealer_daily ADD COLUMN IF NOT EXISTS d_new_media_self_valid_lead_count INTEGER
            """)
            conn.execute("""
                ALTER TABLE report_dealer_daily ADD COLUMN IF NOT EXISTS d_new_media_self_lead_count INTEGER
            """)


            conn.execute("""
                CREATE TABLE mart_online_sales (
                    sales_id VARCHAR PRIMARY KEY,
                    sales_date TIMESTAMP,
                    sales_phone VARCHAR,
                    sales_count VARCHAR,
                    is_converted VARCHAR,
                    region VARCHAR,
                    province VARCHAR,
                    city VARCHAR,
                    dealer_short_name VARCHAR,
                    dealer_id VARCHAR,
                    sales_car_series VARCHAR,
                    lead_create_time TIMESTAMP,
                    lead_before_region VARCHAR,
                    lead_before_province VARCHAR,
                    lead_before_city VARCHAR,
                    lead_after_region VARCHAR,
                    lead_after_province VARCHAR,
                    lead_after_city VARCHAR,
                    lead_dealer_id VARCHAR,
                    lead_dealer_name VARCHAR,
                    lead_status VARCHAR,
                    channel_1 VARCHAR,
                    channel_2 VARCHAR,
                    channel_3 VARCHAR,
                    channel_4 VARCHAR,
                    assign_time TIMESTAMP,
                    invite_result VARCHAR,
                    original_intent_car VARCHAR,
                    invited_intent_car VARCHAR,
                    is_to_shop VARCHAR,
                    is_counted VARCHAR,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS funnel_national_visit_targets (
                    year_month VARCHAR,
                    national_visit_target DOUBLE,
                    is_active BOOLEAN,
                    updated_by VARCHAR,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    PRIMARY KEY (year_month)
                )
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS funnel_sales_targets (
                    year_month VARCHAR,
                    dealer_id VARCHAR,
                    dealer_name VARCHAR,
                    model_name VARCHAR,
                    sales_target DOUBLE,
                    dealer_total_sales_target DOUBLE,
                    source_file VARCHAR,
                    updated_by VARCHAR,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    PRIMARY KEY (year_month, dealer_id, model_name)
                )
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS funnel_conversion_rates (
                    year_month VARCHAR,
                    scope_type VARCHAR,
                    model_name VARCHAR,
                    conversion_rate DOUBLE,
                    updated_by VARCHAR,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    PRIMARY KEY (year_month, scope_type, model_name)
                )
            """)

            conn.execute("""
                CREATE TABLE IF NOT EXISTS funnel_model_mapping (
                    source_table VARCHAR,
                    source_field VARCHAR,
                    source_model_code VARCHAR,
                    standard_model_name VARCHAR,
                    is_active BOOLEAN,
                    updated_by VARCHAR,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    target_enabled BOOLEAN DEFAULT true,
                    PRIMARY KEY (source_table, source_field, source_model_code)
                )
            """)

            conn.execute("""
                CREATE TABLE funnel_model_source_values (
                    year_month VARCHAR,
                    source_type VARCHAR,
                    source_field VARCHAR,
                    source_model_value VARCHAR,
                    occurrence_count INTEGER,
                    dealer_count INTEGER,
                    metric_count DOUBLE,
                    standard_model_name VARCHAR,
                    mapping_status VARCHAR,
                    target_enabled BOOLEAN,
                    last_seen_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    PRIMARY KEY (year_month, source_type, source_field, source_model_value)
                )
            """)

            conn.execute("""
                CREATE TABLE funnel_import_logs (
                    id BIGINT,
                    year_month VARCHAR,
                    file_name VARCHAR,
                    file_dealer_count INTEGER,
                    matched_dealer_count INTEGER,
                    skipped_dealer_count INTEGER,
                    imported_target_count INTEGER,
                    error_count INTEGER,
                    summary VARCHAR,
                    created_by VARCHAR,
                    created_at TIMESTAMP
                )
            """)

            conn.execute("""
                CREATE TABLE funnel_metric_daily (
                    report_date DATE,
                    year_month VARCHAR,
                    dealer_id VARCHAR,
                    dealer_name VARCHAR,
                    region VARCHAR,
                    zone VARCHAR,
                    lead_ops_owner VARCHAR,
                    lead_ops_support VARCHAR,
                    model_code VARCHAR,
                    model_name VARCHAR,
                    channel_1 VARCHAR,
                    channel_2 VARCHAR,
                    channel_3 VARCHAR,
                    channel_4 VARCHAR,
                    online_lead_count INTEGER,
                    valid_lead_count INTEGER,
                    visit_record_count INTEGER,
                    visit_count INTEGER,
                    sales_count INTEGER,
                    lead_valid_rate DOUBLE,
                    lead_visit_rate DOUBLE,
                    valid_lead_visit_rate DOUBLE,
                    lead_sales_rate DOUBLE,
                    valid_lead_sales_rate DOUBLE,
                    visit_sales_rate DOUBLE,
                    unmapped_model_flag BOOLEAN,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
            """)

            conn.execute("""
                CREATE TABLE funnel_metric_monthly (
                    year_month VARCHAR,
                    dealer_id VARCHAR,
                    dealer_name VARCHAR,
                    region VARCHAR,
                    zone VARCHAR,
                    lead_ops_owner VARCHAR,
                    lead_ops_support VARCHAR,
                    model_code VARCHAR,
                    model_name VARCHAR,
                    channel_1 VARCHAR,
                    channel_2 VARCHAR,
                    channel_3 VARCHAR,
                    channel_4 VARCHAR,
                    online_lead_count INTEGER,
                    valid_lead_count INTEGER,
                    visit_record_count INTEGER,
                    visit_count INTEGER,
                    sales_count INTEGER,
                    lead_valid_rate DOUBLE,
                    lead_visit_rate DOUBLE,
                    valid_lead_visit_rate DOUBLE,
                    lead_sales_rate DOUBLE,
                    valid_lead_sales_rate DOUBLE,
                    visit_sales_rate DOUBLE,
                    unmapped_model_flag BOOLEAN,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
            """)

            conn.execute("""
                CREATE TABLE funnel_metric_targets (
                    year_month VARCHAR,
                    dealer_id VARCHAR,
                    dealer_name VARCHAR,
                    region VARCHAR,
                    zone VARCHAR,
                    lead_ops_owner VARCHAR,
                    lead_ops_support VARCHAR,
                    model_name VARCHAR,
                    online_lead_count INTEGER,
                    valid_lead_count INTEGER,
                    visit_count INTEGER,
                    sales_count INTEGER,
                    national_visit_target DOUBLE,
                    dealer_online_lead_share DOUBLE,
                    dealer_visit_target DOUBLE,
                    elapsed_day_ratio DOUBLE,
                    dealer_visit_target_to_date DOUBLE,
                    dealer_visit_gap DOUBLE,
                    dealer_visit_achievement_rate DOUBLE,
                    sales_target DOUBLE,
                    dealer_total_sales_target DOUBLE,
                    applied_conversion_rate DOUBLE,
                    conversion_rate_source VARCHAR,
                    derived_visit_target DOUBLE,
                    derived_visit_target_to_date DOUBLE,
                    derived_visit_gap DOUBLE,
                    derived_achievement_rate DOUBLE,
                    projected_month_end_visit DOUBLE,
                    status_label VARCHAR,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
            """)

            conn.commit()
        finally:
            pass

    def ensure_funnel_schema(self, sqlite_db_path: Path = RAW_DB_PATH):
        """确保漏斗目标分析相关表和新增字段存在。"""
        if self._funnel_schema_ready and self._funnel_schema_tables_exist():
            return

        with self._schema_lock:
            if self._funnel_schema_ready and self._funnel_schema_tables_exist():
                return
            self._funnel_schema_ready = False

            conn = self.get_connection()
            conn.execute("ALTER TABLE mart_dealers ADD COLUMN IF NOT EXISTS lead_ops_owner VARCHAR")
            conn.execute("ALTER TABLE mart_dealers ADD COLUMN IF NOT EXISTS lead_ops_support VARCHAR")
            conn.execute("ALTER TABLE mart_customer_visit ADD COLUMN IF NOT EXISTS intent_model_code VARCHAR")
            sqlite_path = str(sqlite_db_path)
            if sqlite_db_path.exists():
                try:
                    conn.execute(f"""
                        UPDATE mart_dealers d
                        SET
                            lead_ops_owner = COALESCE(CAST(s."线索运营区域负责人" AS VARCHAR), ''),
                            lead_ops_support = COALESCE(CAST(s."线索运营-区域支持" AS VARCHAR), '')
                        FROM sqlite_scan('{sqlite_path}', '门店表') s
                        WHERE d.dealer_id = CAST(s."店编号" AS VARCHAR)
                          AND (d.lead_ops_owner IS NULL OR d.lead_ops_owner = '' OR d.lead_ops_support IS NULL OR d.lead_ops_support = '')
                    """)
                    conn.execute(f"""
                        UPDATE mart_customer_visit v
                        SET intent_model_code = CAST(f."意向车系" AS VARCHAR)
                        FROM sqlite_scan('{sqlite_path}', '跟进表') f
                        WHERE v.lead_id = CAST(f."门店线索id" AS VARCHAR)
                          AND v.dealer_id = CAST(f."门店编码" AS VARCHAR)
                          AND (v.intent_model_code IS NULL OR v.intent_model_code = '')
                    """)
                except Exception as exc:
                    print(f"Warning: failed to backfill funnel source fields: {exc}")

            conn.execute("""
                CREATE TABLE IF NOT EXISTS funnel_national_visit_targets (
                    year_month VARCHAR PRIMARY KEY,
                    national_visit_target DOUBLE,
                    is_active BOOLEAN,
                    updated_by VARCHAR,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS funnel_sales_targets (
                    year_month VARCHAR,
                    dealer_id VARCHAR,
                    dealer_name VARCHAR,
                    model_name VARCHAR,
                    sales_target DOUBLE,
                    dealer_total_sales_target DOUBLE,
                    source_file VARCHAR,
                    updated_by VARCHAR,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    PRIMARY KEY (year_month, dealer_id, model_name)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS funnel_conversion_rates (
                    year_month VARCHAR,
                    scope_type VARCHAR,
                    model_name VARCHAR,
                    conversion_rate DOUBLE,
                    updated_by VARCHAR,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    PRIMARY KEY (year_month, scope_type, model_name)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS funnel_model_mapping (
                    source_table VARCHAR,
                    source_field VARCHAR,
                    source_model_code VARCHAR,
                    standard_model_name VARCHAR,
                    is_active BOOLEAN,
                    updated_by VARCHAR,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    target_enabled BOOLEAN DEFAULT true,
                    PRIMARY KEY (source_table, source_field, source_model_code)
                )
            """)
            conn.execute("ALTER TABLE funnel_model_mapping ADD COLUMN IF NOT EXISTS source_field VARCHAR")
            conn.execute("ALTER TABLE funnel_model_mapping ADD COLUMN IF NOT EXISTS target_enabled BOOLEAN DEFAULT true")
            self._migrate_funnel_model_mapping_schema(conn)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS funnel_model_source_values (
                    year_month VARCHAR,
                    source_type VARCHAR,
                    source_field VARCHAR,
                    source_model_value VARCHAR,
                    occurrence_count INTEGER,
                    dealer_count INTEGER,
                    metric_count DOUBLE,
                    standard_model_name VARCHAR,
                    mapping_status VARCHAR,
                    target_enabled BOOLEAN,
                    last_seen_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    PRIMARY KEY (year_month, source_type, source_field, source_model_value)
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS funnel_import_logs (
                    id BIGINT,
                    year_month VARCHAR,
                    file_name VARCHAR,
                    file_dealer_count INTEGER,
                    matched_dealer_count INTEGER,
                    skipped_dealer_count INTEGER,
                    imported_target_count INTEGER,
                    error_count INTEGER,
                    summary VARCHAR,
                    created_by VARCHAR,
                    created_at TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS funnel_metric_daily (
                    report_date DATE,
                    year_month VARCHAR,
                    dealer_id VARCHAR,
                    dealer_name VARCHAR,
                    region VARCHAR,
                    zone VARCHAR,
                    lead_ops_owner VARCHAR,
                    lead_ops_support VARCHAR,
                    model_code VARCHAR,
                    model_name VARCHAR,
                    channel_1 VARCHAR,
                    channel_2 VARCHAR,
                    channel_3 VARCHAR,
                    channel_4 VARCHAR,
                    online_lead_count INTEGER,
                    valid_lead_count INTEGER,
                    visit_record_count INTEGER,
                    visit_count INTEGER,
                    sales_count INTEGER,
                    lead_valid_rate DOUBLE,
                    lead_visit_rate DOUBLE,
                    valid_lead_visit_rate DOUBLE,
                    lead_sales_rate DOUBLE,
                    valid_lead_sales_rate DOUBLE,
                    visit_sales_rate DOUBLE,
                    unmapped_model_flag BOOLEAN,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS funnel_metric_monthly (
                    year_month VARCHAR,
                    dealer_id VARCHAR,
                    dealer_name VARCHAR,
                    region VARCHAR,
                    zone VARCHAR,
                    lead_ops_owner VARCHAR,
                    lead_ops_support VARCHAR,
                    model_code VARCHAR,
                    model_name VARCHAR,
                    channel_1 VARCHAR,
                    channel_2 VARCHAR,
                    channel_3 VARCHAR,
                    channel_4 VARCHAR,
                    online_lead_count INTEGER,
                    valid_lead_count INTEGER,
                    visit_record_count INTEGER,
                    visit_count INTEGER,
                    sales_count INTEGER,
                    lead_valid_rate DOUBLE,
                    lead_visit_rate DOUBLE,
                    valid_lead_visit_rate DOUBLE,
                    lead_sales_rate DOUBLE,
                    valid_lead_sales_rate DOUBLE,
                    visit_sales_rate DOUBLE,
                    unmapped_model_flag BOOLEAN,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS funnel_metric_targets (
                    year_month VARCHAR,
                    dealer_id VARCHAR,
                    dealer_name VARCHAR,
                    region VARCHAR,
                    zone VARCHAR,
                    lead_ops_owner VARCHAR,
                    lead_ops_support VARCHAR,
                    model_name VARCHAR,
                    online_lead_count INTEGER,
                    valid_lead_count INTEGER,
                    visit_count INTEGER,
                    sales_count INTEGER,
                    national_visit_target DOUBLE,
                    dealer_online_lead_share DOUBLE,
                    dealer_visit_target DOUBLE,
                    elapsed_day_ratio DOUBLE,
                    dealer_visit_target_to_date DOUBLE,
                    dealer_visit_gap DOUBLE,
                    dealer_visit_achievement_rate DOUBLE,
                    sales_target DOUBLE,
                    dealer_total_sales_target DOUBLE,
                    applied_conversion_rate DOUBLE,
                    conversion_rate_source VARCHAR,
                    derived_visit_target DOUBLE,
                    derived_visit_target_to_date DOUBLE,
                    derived_visit_gap DOUBLE,
                    derived_achievement_rate DOUBLE,
                    projected_month_end_visit DOUBLE,
                    status_label VARCHAR,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP
                )
            """)
            conn.commit()
            self._funnel_schema_ready = True

    def _migrate_funnel_model_mapping_schema(self, conn):
        """将车型映射表迁移到“来源+字段+原始值”的唯一粒度。"""
        try:
            columns = conn.execute("PRAGMA table_info('funnel_model_mapping')").fetchall()
            pk_columns = [row[1] for row in sorted((row for row in columns if row[5]), key=lambda row: row[5])]
            if pk_columns == ["source_table", "source_field", "source_model_code"]:
                return

            conn.execute("DROP TABLE IF EXISTS funnel_model_mapping_new")
            conn.execute("""
                CREATE TABLE funnel_model_mapping_new (
                    source_table VARCHAR,
                    source_field VARCHAR,
                    source_model_code VARCHAR,
                    standard_model_name VARCHAR,
                    is_active BOOLEAN,
                    updated_by VARCHAR,
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    target_enabled BOOLEAN DEFAULT true,
                    PRIMARY KEY (source_table, source_field, source_model_code)
                )
            """)
            conn.execute("""
                INSERT OR IGNORE INTO funnel_model_mapping_new
                SELECT
                    source_table,
                    COALESCE(NULLIF(source_field, ''),
                        CASE source_table
                            WHEN '线索' THEN 'invite_intent_or_conversion_model'
                            WHEN '到店' THEN 'intent_model_code'
                            WHEN '成交' THEN 'sales_car_series_or_intent'
                            WHEN '成交目标' THEN 'target_model_name'
                            ELSE ''
                        END
                    ) AS source_field,
                    source_model_code,
                    standard_model_name,
                    COALESCE(is_active, true) AS is_active,
                    updated_by,
                    created_at,
                    updated_at,
                    COALESCE(target_enabled, true) AS target_enabled
                FROM funnel_model_mapping
            """)
            conn.execute("DROP TABLE funnel_model_mapping")
            conn.execute("ALTER TABLE funnel_model_mapping_new RENAME TO funnel_model_mapping")
        except Exception as exc:
            print(f"Warning: failed to migrate funnel model mapping schema: {exc}")

    def _target_month_bounds(self, year_month: str = None):
        if year_month:
            year, month = [int(part) for part in year_month.split("-")]
            start = date(year, month, 1)
            end = date(year, month, calendar.monthrange(year, month)[1])
            return year_month, start, end

        conn = self.get_connection()
        result = conn.execute("SELECT MAX(assign_date) FROM mart_leads WHERE channel_1 = '线上'").fetchone()
        latest = result[0] if result and result[0] else date.today()
        if isinstance(latest, datetime):
            latest = latest.date()
        year_month = f"{latest.year:04d}-{latest.month:02d}"
        start = date(latest.year, latest.month, 1)
        return year_month, start, latest

    def _progress_ratios(self, year_month: str):
        year, month = [int(part) for part in year_month.split("-")]
        days_in_month = calendar.monthrange(year, month)[1]
        today = date.today()
        time_progress_day = today.day if today.year == year and today.month == month else days_in_month
        if date(year, month, 1) > today:
            time_progress_day = 0

        conn = self.get_connection()
        row = conn.execute("""
            SELECT MAX(assign_date)
            FROM mart_leads
            WHERE channel_1 = '线上'
              AND assign_date >= ?
              AND assign_date <= ?
              AND dealer_id IN (SELECT dealer_id FROM mart_dealers)
        """, [date(year, month, 1), date(year, month, days_in_month)]).fetchone()
        latest = row[0] if row and row[0] else None
        if isinstance(latest, datetime):
            latest = latest.date()
        data_progress_day = latest.day if latest else 0
        return {
            "time_progress_ratio": time_progress_day / days_in_month if days_in_month else 0,
            "data_progress_ratio": data_progress_day / days_in_month if days_in_month else 0,
            "latest_lead_date": latest,
            "days_in_month": days_in_month,
        }

    def _mapping_join(self, source_type: str, source_field: str, expression: str):
        return f"""
            LEFT JOIN funnel_model_mapping mm
                ON COALESCE(NULLIF(mm.source_field, ''), '{source_field}') = '{source_field}'
               AND mm.source_table = '{source_type}'
               AND mm.source_model_code = {expression}
               AND mm.is_active
        """

    def scan_funnel_model_source_values(self, year_month: str):
        self.ensure_funnel_schema()
        year_month, start, end = self._target_month_bounds(year_month)
        today = date.today()
        if end.year == today.year and end.month == today.month:
            end = min(end, today - timedelta(days=1))
        conn = self.get_connection()
        conn.execute("DELETE FROM funnel_model_source_values WHERE year_month = ?", [year_month])
        now = datetime.now()

        scan_specs = [
            {
                "source_type": "线索",
                "source_field": "invite_intent_or_conversion_model",
                "table_sql": "mart_leads l JOIN mart_dealers d ON l.dealer_id = d.dealer_id",
                "value_expr": "COALESCE(NULLIF(TRIM(l.invite_intent), ''), NULLIF(TRIM(l.conversion_model), ''), '未映射车型')",
                "dealer_expr": "l.dealer_id",
                "where_sql": f"l.channel_1 = '线上' AND l.assign_date >= DATE '{start}' AND l.assign_date <= DATE '{end}'",
                "metric_expr": "COUNT(*)",
            },
            {
                "source_type": "到店",
                "source_field": "intent_model_code",
                "table_sql": f"""
                    (
                        SELECT *
                        FROM (
                            SELECT
                                v.*,
                                ROW_NUMBER() OVER (
                                    PARTITION BY v.dealer_id, v.lead_id, CAST(v.visit_time AS DATE)
                                    ORDER BY v.visit_time, COALESCE(v.intent_model_code, '')
                                ) AS rn
                            FROM mart_customer_visit v
                            WHERE v.channel_1 = '线上'
                              AND CAST(v.visit_time AS DATE) >= DATE '{start}'
                              AND CAST(v.visit_time AS DATE) <= DATE '{end}'
                        )
                        WHERE rn = 1
                    ) v
                    JOIN mart_dealers d ON v.dealer_id = d.dealer_id
                """,
                "value_expr": "COALESCE(NULLIF(TRIM(v.intent_model_code), ''), '未映射车型')",
                "dealer_expr": "v.dealer_id",
                "where_sql": "true",
                "metric_expr": "COUNT(*)",
            },
            {
                "source_type": "成交",
                "source_field": "sales_car_series_or_intent",
                "table_sql": "mart_online_sales s JOIN mart_dealers d ON COALESCE(NULLIF(TRIM(s.dealer_id), ''), NULLIF(TRIM(s.lead_dealer_id), '')) = d.dealer_id",
                "value_expr": "COALESCE(NULLIF(TRIM(s.sales_car_series), ''), NULLIF(TRIM(s.invited_intent_car), ''), NULLIF(TRIM(s.original_intent_car), ''), '未映射车型')",
                "dealer_expr": "COALESCE(NULLIF(TRIM(s.dealer_id), ''), NULLIF(TRIM(s.lead_dealer_id), ''))",
                "where_sql": f"s.channel_1 = '线上' AND COALESCE(s.channel_4, '') != 'APP订单-排产定' AND COALESCE(s.is_counted, '是') = '是' AND CAST(s.sales_date AS DATE) >= DATE '{start}' AND CAST(s.sales_date AS DATE) <= DATE '{end}'",
                "metric_expr": "COUNT(*)",
            },
            {
                "source_type": "成交目标",
                "source_field": "target_model_name",
                "table_sql": "funnel_sales_targets t JOIN mart_dealers d ON t.dealer_id = d.dealer_id",
                "value_expr": "COALESCE(NULLIF(TRIM(t.model_name), ''), '未映射车型')",
                "dealer_expr": "t.dealer_id",
                "where_sql": f"t.year_month = '{year_month}'",
                "metric_expr": "SUM(t.sales_target)",
            },
        ]

        for spec in scan_specs:
            conn.execute(f"""
                INSERT INTO funnel_model_source_values
                WITH source_values AS (
                    SELECT
                        {spec['value_expr']} AS source_model_value,
                        {spec['dealer_expr']} AS dealer_id,
                        {spec['metric_expr']} AS metric_count,
                        COUNT(*) AS occurrence_count
                    FROM {spec['table_sql']}
                    WHERE {spec['where_sql']}
                    GROUP BY {spec['value_expr']}, {spec['dealer_expr']}
                ),
                rolled AS (
                    SELECT
                        source_model_value,
                        SUM(occurrence_count)::INTEGER AS occurrence_count,
                        COUNT(DISTINCT dealer_id)::INTEGER AS dealer_count,
                        COALESCE(SUM(metric_count), 0) AS metric_count
                    FROM source_values
                    GROUP BY source_model_value
                )
                SELECT
                    ? AS year_month,
                    ? AS source_type,
                    ? AS source_field,
                    r.source_model_value,
                    r.occurrence_count,
                    r.dealer_count,
                    r.metric_count,
                    COALESCE(mm.standard_model_name, '') AS standard_model_name,
                    CASE WHEN mm.standard_model_name IS NULL OR mm.standard_model_name = '' THEN '未映射' ELSE '已映射' END AS mapping_status,
                    COALESCE(mm.target_enabled, true) AS target_enabled,
                    ? AS last_seen_at,
                    ? AS updated_at
                FROM rolled r
                LEFT JOIN funnel_model_mapping mm
                    ON mm.source_table = ?
                   AND COALESCE(NULLIF(mm.source_field, ''), ?) = ?
                   AND mm.source_model_code = r.source_model_value
                   AND mm.is_active
            """, [
                year_month, spec["source_type"], spec["source_field"], now, now,
                spec["source_type"], spec["source_field"], spec["source_field"]
            ])
        conn.commit()

    def compute_funnel_metrics(self, year_month: str = None):
        """计算线上线索漏斗实际指标。"""
        self.ensure_funnel_schema()
        year_month, start, end = self._target_month_bounds(year_month)
        today = date.today()
        if end.year == today.year and end.month == today.month:
            end = min(end, today - timedelta(days=1))
        conn = self.get_connection()
        print(f"Computing funnel metrics for {year_month} ({start} to {end})...")
        self.scan_funnel_model_source_values(year_month)

        conn.execute("DELETE FROM funnel_metric_daily WHERE year_month = ?", [year_month])
        conn.execute("DELETE FROM funnel_metric_monthly WHERE year_month = ?", [year_month])

        base_sql = f"""
            WITH lead_base AS (
                SELECT
                    l.assign_date AS report_date,
                    strftime(l.assign_date, '%Y-%m') AS year_month,
                    l.dealer_id,
                    COALESCE(d.dealer_name, l.dealer_name, '') AS dealer_name,
                    COALESCE(d.region, l.region, '') AS region,
                    COALESCE(d.zone, '') AS zone,
                    COALESCE(d.lead_ops_owner, '') AS lead_ops_owner,
                    COALESCE(d.lead_ops_support, '') AS lead_ops_support,
                    COALESCE(NULLIF(TRIM(l.invite_intent), ''), NULLIF(TRIM(l.conversion_model), ''), '未映射车型') AS model_code,
                    COALESCE(mm.standard_model_name, NULLIF(TRIM(l.invite_intent), ''), NULLIF(TRIM(l.conversion_model), ''), '未映射车型') AS model_name,
                    COALESCE(l.channel_1, '') AS channel_1,
                    COALESCE(l.channel_2, '') AS channel_2,
                    COALESCE(l.channel_3, '') AS channel_3,
                    COALESCE(l.channel_4, '') AS channel_4,
                    COUNT(*) AS online_lead_count,
                    SUM(CASE WHEN l.lead_status = '跟进中' THEN 1 ELSE 0 END) AS valid_lead_count,
                    0 AS visit_record_count,
                    0 AS visit_count,
                    0 AS sales_count,
                    CASE WHEN mm.standard_model_name IS NULL THEN true ELSE false END AS unmapped_model_flag
                FROM mart_leads l
                JOIN mart_dealers d ON l.dealer_id = d.dealer_id
                LEFT JOIN funnel_model_mapping mm
                    ON mm.source_table = '线索'
                   AND COALESCE(NULLIF(mm.source_field, ''), 'invite_intent_or_conversion_model') = 'invite_intent_or_conversion_model'
                   AND mm.source_model_code = COALESCE(NULLIF(TRIM(l.invite_intent), ''), NULLIF(TRIM(l.conversion_model), ''), '未映射车型')
                   AND mm.is_active
                WHERE l.channel_1 = '线上'
                  AND l.assign_date >= DATE '{start}'
                  AND l.assign_date <= DATE '{end}'
                GROUP BY
                    l.assign_date, l.dealer_id, COALESCE(d.dealer_name, l.dealer_name, ''),
                    COALESCE(d.region, l.region, ''), COALESCE(d.zone, ''),
                    COALESCE(d.lead_ops_owner, ''), COALESCE(d.lead_ops_support, ''),
                    COALESCE(NULLIF(TRIM(l.invite_intent), ''), NULLIF(TRIM(l.conversion_model), ''), '未映射车型'),
                    COALESCE(mm.standard_model_name, NULLIF(TRIM(l.invite_intent), ''), NULLIF(TRIM(l.conversion_model), ''), '未映射车型'),
                    COALESCE(l.channel_1, ''), COALESCE(l.channel_2, ''), COALESCE(l.channel_3, ''), COALESCE(l.channel_4, ''),
                    CASE WHEN mm.standard_model_name IS NULL THEN true ELSE false END
            ),
            visit_dedup AS (
                SELECT *
                FROM (
                    SELECT
                        v.*,
                        ROW_NUMBER() OVER (
                            PARTITION BY v.dealer_id, v.lead_id, CAST(v.visit_time AS DATE)
                            ORDER BY v.visit_time, COALESCE(v.intent_model_code, '')
                        ) AS rn
                    FROM mart_customer_visit v
                    WHERE v.channel_1 = '线上'
                      AND CAST(v.visit_time AS DATE) >= DATE '{start}'
                      AND CAST(v.visit_time AS DATE) <= DATE '{end}'
                )
                WHERE rn = 1
            ),
            visit_base AS (
                SELECT
                    CAST(v.visit_time AS DATE) AS report_date,
                    strftime(CAST(v.visit_time AS DATE), '%Y-%m') AS year_month,
                    v.dealer_id,
                    COALESCE(d.dealer_name, v.dealer_short_name, '') AS dealer_name,
                    COALESCE(d.region, v.region, '') AS region,
                    COALESCE(d.zone, v.zone, '') AS zone,
                    COALESCE(d.lead_ops_owner, '') AS lead_ops_owner,
                    COALESCE(d.lead_ops_support, '') AS lead_ops_support,
                    COALESCE(NULLIF(TRIM(v.intent_model_code), ''), '未映射车型') AS model_code,
                    COALESCE(mm.standard_model_name, NULLIF(TRIM(v.intent_model_code), ''), '未映射车型') AS model_name,
                    COALESCE(v.channel_1, '') AS channel_1,
                    COALESCE(v.channel_2, '') AS channel_2,
                    COALESCE(v.channel_3, '') AS channel_3,
                    COALESCE(v.channel_4, '') AS channel_4,
                    0 AS online_lead_count,
                    0 AS valid_lead_count,
                    COUNT(*) AS visit_record_count,
                    COUNT(*) AS visit_count,
                    0 AS sales_count,
                    CASE WHEN mm.standard_model_name IS NULL THEN true ELSE false END AS unmapped_model_flag
                FROM visit_dedup v
                JOIN mart_dealers d ON v.dealer_id = d.dealer_id
                LEFT JOIN funnel_model_mapping mm
                    ON mm.source_table = '到店'
                   AND COALESCE(NULLIF(mm.source_field, ''), 'intent_model_code') = 'intent_model_code'
                   AND mm.source_model_code = COALESCE(NULLIF(TRIM(v.intent_model_code), ''), '未映射车型')
                   AND mm.is_active
                WHERE true
                GROUP BY
                    CAST(v.visit_time AS DATE), v.dealer_id, COALESCE(d.dealer_name, v.dealer_short_name, ''),
                    COALESCE(d.region, v.region, ''), COALESCE(d.zone, v.zone, ''),
                    COALESCE(d.lead_ops_owner, ''), COALESCE(d.lead_ops_support, ''),
                    COALESCE(NULLIF(TRIM(v.intent_model_code), ''), '未映射车型'),
                    COALESCE(mm.standard_model_name, NULLIF(TRIM(v.intent_model_code), ''), '未映射车型'),
                    COALESCE(v.channel_1, ''), COALESCE(v.channel_2, ''), COALESCE(v.channel_3, ''), COALESCE(v.channel_4, ''),
                    CASE WHEN mm.standard_model_name IS NULL THEN true ELSE false END
            ),
            sales_base AS (
                SELECT
                    CAST(s.sales_date AS DATE) AS report_date,
                    strftime(CAST(s.sales_date AS DATE), '%Y-%m') AS year_month,
                    COALESCE(NULLIF(TRIM(s.dealer_id), ''), NULLIF(TRIM(s.lead_dealer_id), '')) AS dealer_id,
                    COALESCE(d.dealer_name, s.dealer_short_name, s.lead_dealer_name, '') AS dealer_name,
                    COALESCE(d.region, s.region, '') AS region,
                    COALESCE(d.zone, '') AS zone,
                    COALESCE(d.lead_ops_owner, '') AS lead_ops_owner,
                    COALESCE(d.lead_ops_support, '') AS lead_ops_support,
                    COALESCE(NULLIF(TRIM(s.sales_car_series), ''), NULLIF(TRIM(s.invited_intent_car), ''), NULLIF(TRIM(s.original_intent_car), ''), '未映射车型') AS model_code,
                    COALESCE(mm.standard_model_name, NULLIF(TRIM(s.sales_car_series), ''), NULLIF(TRIM(s.invited_intent_car), ''), NULLIF(TRIM(s.original_intent_car), ''), '未映射车型') AS model_name,
                    COALESCE(s.channel_1, '') AS channel_1,
                    COALESCE(s.channel_2, '') AS channel_2,
                    COALESCE(s.channel_3, '') AS channel_3,
                    COALESCE(s.channel_4, '') AS channel_4,
                    0 AS online_lead_count,
                    0 AS valid_lead_count,
                    0 AS visit_record_count,
                    0 AS visit_count,
                    COUNT(*) AS sales_count,
                    CASE WHEN mm.standard_model_name IS NULL THEN true ELSE false END AS unmapped_model_flag
                FROM mart_online_sales s
                JOIN mart_dealers d ON COALESCE(NULLIF(TRIM(s.dealer_id), ''), NULLIF(TRIM(s.lead_dealer_id), '')) = d.dealer_id
                LEFT JOIN funnel_model_mapping mm
                    ON mm.source_table = '成交'
                   AND COALESCE(NULLIF(mm.source_field, ''), 'sales_car_series_or_intent') = 'sales_car_series_or_intent'
                   AND mm.source_model_code = COALESCE(NULLIF(TRIM(s.sales_car_series), ''), NULLIF(TRIM(s.invited_intent_car), ''), NULLIF(TRIM(s.original_intent_car), ''), '未映射车型')
                   AND mm.is_active
                WHERE s.channel_1 = '线上'
                  AND COALESCE(s.channel_4, '') != 'APP订单-排产定'
                  AND COALESCE(s.is_counted, '是') = '是'
                  AND CAST(s.sales_date AS DATE) >= DATE '{start}'
                  AND CAST(s.sales_date AS DATE) <= DATE '{end}'
                GROUP BY
                    CAST(s.sales_date AS DATE), COALESCE(NULLIF(TRIM(s.dealer_id), ''), NULLIF(TRIM(s.lead_dealer_id), '')),
                    COALESCE(d.dealer_name, s.dealer_short_name, s.lead_dealer_name, ''),
                    COALESCE(d.region, s.region, ''), COALESCE(d.zone, ''),
                    COALESCE(d.lead_ops_owner, ''), COALESCE(d.lead_ops_support, ''),
                    COALESCE(NULLIF(TRIM(s.sales_car_series), ''), NULLIF(TRIM(s.invited_intent_car), ''), NULLIF(TRIM(s.original_intent_car), ''), '未映射车型'),
                    COALESCE(mm.standard_model_name, NULLIF(TRIM(s.sales_car_series), ''), NULLIF(TRIM(s.invited_intent_car), ''), NULLIF(TRIM(s.original_intent_car), ''), '未映射车型'),
                    COALESCE(s.channel_1, ''), COALESCE(s.channel_2, ''), COALESCE(s.channel_3, ''), COALESCE(s.channel_4, ''),
                    CASE WHEN mm.standard_model_name IS NULL THEN true ELSE false END
            ),
            unioned AS (
                SELECT * FROM lead_base
                UNION ALL SELECT * FROM visit_base
                UNION ALL SELECT * FROM sales_base
            )
        """

        conn.execute(f"""
            INSERT INTO funnel_metric_daily
            {base_sql}
            SELECT
                report_date, year_month, dealer_id, dealer_name, region, zone,
                lead_ops_owner, lead_ops_support, model_code, model_name,
                channel_1, channel_2, channel_3, channel_4,
                SUM(online_lead_count)::INTEGER,
                SUM(valid_lead_count)::INTEGER,
                SUM(visit_record_count)::INTEGER,
                SUM(visit_count)::INTEGER,
                SUM(sales_count)::INTEGER,
                CASE WHEN SUM(online_lead_count) > 0 THEN SUM(valid_lead_count) * 100.0 / SUM(online_lead_count) ELSE 0 END,
                CASE WHEN SUM(online_lead_count) > 0 THEN SUM(visit_count) * 100.0 / SUM(online_lead_count) ELSE 0 END,
                CASE WHEN SUM(valid_lead_count) > 0 THEN SUM(visit_count) * 100.0 / SUM(valid_lead_count) ELSE 0 END,
                CASE WHEN SUM(online_lead_count) > 0 THEN SUM(sales_count) * 100.0 / SUM(online_lead_count) ELSE 0 END,
                CASE WHEN SUM(valid_lead_count) > 0 THEN SUM(sales_count) * 100.0 / SUM(valid_lead_count) ELSE 0 END,
                CASE WHEN SUM(visit_count) > 0 THEN SUM(sales_count) * 100.0 / SUM(visit_count) ELSE 0 END,
                BOOL_OR(unmapped_model_flag),
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            FROM unioned
            GROUP BY report_date, year_month, dealer_id, dealer_name, region, zone,
                lead_ops_owner, lead_ops_support, model_code, model_name,
                channel_1, channel_2, channel_3, channel_4
        """)

        conn.execute("""
            INSERT INTO funnel_metric_monthly
            SELECT
                year_month, dealer_id, dealer_name, region, zone, lead_ops_owner, lead_ops_support,
                model_code, model_name, channel_1, channel_2, channel_3, channel_4,
                SUM(online_lead_count)::INTEGER,
                SUM(valid_lead_count)::INTEGER,
                SUM(visit_record_count)::INTEGER,
                SUM(visit_count)::INTEGER,
                SUM(sales_count)::INTEGER,
                CASE WHEN SUM(online_lead_count) > 0 THEN SUM(valid_lead_count) * 100.0 / SUM(online_lead_count) ELSE 0 END,
                CASE WHEN SUM(online_lead_count) > 0 THEN SUM(visit_count) * 100.0 / SUM(online_lead_count) ELSE 0 END,
                CASE WHEN SUM(valid_lead_count) > 0 THEN SUM(visit_count) * 100.0 / SUM(valid_lead_count) ELSE 0 END,
                CASE WHEN SUM(online_lead_count) > 0 THEN SUM(sales_count) * 100.0 / SUM(online_lead_count) ELSE 0 END,
                CASE WHEN SUM(valid_lead_count) > 0 THEN SUM(sales_count) * 100.0 / SUM(valid_lead_count) ELSE 0 END,
                CASE WHEN SUM(visit_count) > 0 THEN SUM(sales_count) * 100.0 / SUM(visit_count) ELSE 0 END,
                BOOL_OR(unmapped_model_flag),
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            FROM funnel_metric_daily
            WHERE year_month = ?
            GROUP BY year_month, dealer_id, dealer_name, region, zone, lead_ops_owner, lead_ops_support,
                model_code, model_name, channel_1, channel_2, channel_3, channel_4
        """, [year_month])
        conn.commit()
        self.compute_funnel_targets(year_month)
        print("Funnel metrics computed!")

    def compute_funnel_targets(self, year_month: str):
        """计算漏斗目标达成和缺口。"""
        self.ensure_funnel_schema()
        conn = self.get_connection()
        progress = self._progress_ratios(year_month)
        elapsed_day_ratio = progress["time_progress_ratio"]
        data_progress_ratio = progress["data_progress_ratio"]

        conn.execute("DELETE FROM funnel_metric_targets WHERE year_month = ?", [year_month])
        conn.execute(f"""
            INSERT INTO funnel_metric_targets
            WITH dealer_actual AS (
                SELECT
                    year_month, dealer_id, dealer_name, region, zone, lead_ops_owner, lead_ops_support,
                    SUM(online_lead_count) AS online_lead_count,
                    SUM(valid_lead_count) AS valid_lead_count,
                    SUM(visit_count) AS visit_count,
                    SUM(sales_count) AS sales_count
                FROM funnel_metric_monthly
                WHERE year_month = ?
                GROUP BY year_month, dealer_id, dealer_name, region, zone, lead_ops_owner, lead_ops_support
            ),
            national AS (
                SELECT COALESCE(SUM(online_lead_count), 0) AS national_online_leads
                FROM dealer_actual
            ),
            target_config AS (
                SELECT COALESCE(MAX(national_visit_target), 0) AS national_visit_target
                FROM funnel_national_visit_targets
                WHERE year_month = ? AND is_active
            ),
            model_actual AS (
                SELECT
                    year_month, dealer_id, model_name,
                    SUM(online_lead_count) AS model_online_lead_count,
                    SUM(valid_lead_count) AS model_valid_lead_count,
                    SUM(visit_count) AS model_visit_count,
                    SUM(sales_count) AS model_sales_count
                FROM funnel_metric_monthly
                WHERE year_month = ?
                GROUP BY year_month, dealer_id, model_name
            ),
            sales_targets AS (
                SELECT
                    t.year_month,
                    t.dealer_id,
                    COALESCE(d.dealer_name, t.dealer_name, '') AS dealer_name,
                    COALESCE(d.region, '') AS region,
                    COALESCE(d.zone, '') AS zone,
                    COALESCE(d.lead_ops_owner, '') AS lead_ops_owner,
                    COALESCE(d.lead_ops_support, '') AS lead_ops_support,
                    COALESCE(mm.standard_model_name, t.model_name) AS model_name,
                    SUM(sales_target) AS sales_target,
                    MAX(dealer_total_sales_target) AS dealer_total_sales_target
                FROM funnel_sales_targets t
                JOIN mart_dealers d ON t.dealer_id = d.dealer_id
                LEFT JOIN funnel_model_mapping mm
                    ON mm.source_table = '成交目标'
                   AND COALESCE(NULLIF(mm.source_field, ''), 'target_model_name') = 'target_model_name'
                   AND mm.source_model_code = t.model_name
                   AND mm.is_active
                   AND mm.target_enabled
                WHERE t.year_month = ?
                GROUP BY
                    t.year_month,
                    t.dealer_id,
                    COALESCE(d.dealer_name, t.dealer_name, ''),
                    COALESCE(d.region, ''),
                    COALESCE(d.zone, ''),
                    COALESCE(d.lead_ops_owner, ''),
                    COALESCE(d.lead_ops_support, ''),
                    COALESCE(mm.standard_model_name, t.model_name)
            ),
            dealer_keys AS (
                SELECT year_month, dealer_id, dealer_name, region, zone, lead_ops_owner, lead_ops_support FROM dealer_actual
                UNION
                SELECT year_month, dealer_id, dealer_name, region, zone, lead_ops_owner, lead_ops_support FROM sales_targets
            ),
            model_keys AS (
                SELECT year_month, dealer_id, model_name FROM model_actual
                UNION
                SELECT year_month, dealer_id, model_name FROM sales_targets
            ),
            default_rate AS (
                SELECT conversion_rate
                FROM funnel_conversion_rates
                WHERE year_month = ? AND scope_type = 'national'
                ORDER BY updated_at DESC
                LIMIT 1
            ),
            model_rates AS (
                SELECT model_name, conversion_rate
                FROM funnel_conversion_rates
                WHERE year_month = ? AND scope_type = 'model'
            ),
            calc AS (
                SELECT
                    dk.year_month,
                    dk.dealer_id,
                    dk.dealer_name,
                    dk.region,
                    dk.zone,
                    dk.lead_ops_owner,
                    dk.lead_ops_support,
                    mk.model_name,
                    COALESCE(ma.model_online_lead_count, 0)::INTEGER AS online_lead_count,
                    COALESCE(ma.model_valid_lead_count, 0)::INTEGER AS valid_lead_count,
                    COALESCE(ma.model_visit_count, 0)::INTEGER AS visit_count,
                    COALESCE(ma.model_sales_count, 0)::INTEGER AS sales_count,
                    tc.national_visit_target,
                    CASE WHEN n.national_online_leads > 0 THEN COALESCE(da.online_lead_count, 0) * 1.0 / n.national_online_leads ELSE 0 END AS dealer_online_lead_share,
                    tc.national_visit_target * CASE WHEN n.national_online_leads > 0 THEN COALESCE(da.online_lead_count, 0) * 1.0 / n.national_online_leads ELSE 0 END AS dealer_visit_target,
                    {elapsed_day_ratio} AS elapsed_day_ratio,
                    tc.national_visit_target * CASE WHEN n.national_online_leads > 0 THEN COALESCE(da.online_lead_count, 0) * 1.0 / n.national_online_leads ELSE 0 END * {data_progress_ratio} AS dealer_visit_target_to_date,
                    COALESCE(da.visit_count, 0) - (tc.national_visit_target * CASE WHEN n.national_online_leads > 0 THEN COALESCE(da.online_lead_count, 0) * 1.0 / n.national_online_leads ELSE 0 END * {data_progress_ratio}) AS dealer_visit_gap,
                    CASE WHEN (tc.national_visit_target * CASE WHEN n.national_online_leads > 0 THEN COALESCE(da.online_lead_count, 0) * 1.0 / n.national_online_leads ELSE 0 END * {data_progress_ratio}) > 0
                        THEN COALESCE(da.visit_count, 0) * 100.0 / (tc.national_visit_target * CASE WHEN n.national_online_leads > 0 THEN COALESCE(da.online_lead_count, 0) * 1.0 / n.national_online_leads ELSE 0 END * {data_progress_ratio})
                        ELSE 0 END AS dealer_visit_achievement_rate,
                    COALESCE(st.sales_target, 0) AS sales_target,
                    COALESCE(st.dealer_total_sales_target, 0) AS dealer_total_sales_target,
                    COALESCE(mr.conversion_rate, dr.conversion_rate, 0) AS applied_conversion_rate,
                    CASE WHEN mr.conversion_rate IS NOT NULL THEN '车型转化率'
                         WHEN dr.conversion_rate IS NOT NULL THEN '全国统一转化率'
                         ELSE '未配置' END AS conversion_rate_source,
                    CASE WHEN COALESCE(mr.conversion_rate, dr.conversion_rate, 0) > 0
                        THEN COALESCE(st.sales_target, 0) / COALESCE(mr.conversion_rate, dr.conversion_rate, 0)
                        ELSE 0 END AS derived_visit_target,
                    CASE WHEN COALESCE(mr.conversion_rate, dr.conversion_rate, 0) > 0
                        THEN COALESCE(st.sales_target, 0) / COALESCE(mr.conversion_rate, dr.conversion_rate, 0) * {data_progress_ratio}
                        ELSE 0 END AS derived_visit_target_to_date,
                    COALESCE(ma.model_visit_count, 0) - CASE WHEN COALESCE(mr.conversion_rate, dr.conversion_rate, 0) > 0
                        THEN COALESCE(st.sales_target, 0) / COALESCE(mr.conversion_rate, dr.conversion_rate, 0) * {data_progress_ratio}
                        ELSE 0 END AS derived_visit_gap,
                    CASE WHEN (CASE WHEN COALESCE(mr.conversion_rate, dr.conversion_rate, 0) > 0
                        THEN COALESCE(st.sales_target, 0) / COALESCE(mr.conversion_rate, dr.conversion_rate, 0) * {data_progress_ratio}
                        ELSE 0 END) > 0
                        THEN COALESCE(ma.model_visit_count, 0) * 100.0 / (COALESCE(st.sales_target, 0) / COALESCE(mr.conversion_rate, dr.conversion_rate, 0) * {data_progress_ratio})
                        ELSE 0 END AS derived_achievement_rate,
                    CASE WHEN {data_progress_ratio} > 0 THEN COALESCE(da.visit_count, 0) / {data_progress_ratio} ELSE COALESCE(da.visit_count, 0) END AS projected_month_end_visit
                FROM dealer_keys dk
                JOIN national n ON true
                JOIN target_config tc ON true
                JOIN model_keys mk ON dk.year_month = mk.year_month AND dk.dealer_id = mk.dealer_id
                LEFT JOIN dealer_actual da ON dk.year_month = da.year_month AND dk.dealer_id = da.dealer_id
                LEFT JOIN model_actual ma ON mk.year_month = ma.year_month AND mk.dealer_id = ma.dealer_id AND mk.model_name = ma.model_name
                LEFT JOIN sales_targets st ON mk.year_month = st.year_month AND mk.dealer_id = st.dealer_id AND mk.model_name = st.model_name
                LEFT JOIN default_rate dr ON true
                LEFT JOIN model_rates mr ON mk.model_name = mr.model_name
            )
            SELECT
                *,
                CASE
                    WHEN dealer_visit_achievement_rate >= 100 THEN '正常'
                    WHEN dealer_visit_achievement_rate >= 80 THEN '轻微滞后'
                    WHEN dealer_visit_achievement_rate >= 60 THEN '明显滞后'
                    ELSE '严重滞后'
                END AS status_label,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            FROM calc
        """, [year_month, year_month, year_month, year_month, year_month, year_month])
        conn.commit()

    def set_funnel_visit_target(self, year_month: str, target: float, updated_by: str = ""):
        self.ensure_funnel_schema()
        now = datetime.now()
        conn = self.get_connection()
        conn.execute("""
            INSERT INTO funnel_national_visit_targets
            VALUES (?, ?, true, ?, ?, ?)
            ON CONFLICT (year_month) DO UPDATE SET
                national_visit_target = excluded.national_visit_target,
                is_active = true,
                updated_by = excluded.updated_by,
                updated_at = excluded.updated_at
        """, [year_month, target, updated_by, now, now])
        conn.commit()
        self.compute_funnel_targets(year_month)

    def set_funnel_conversion_rate(self, year_month: str, scope_type: str, model_name: str, conversion_rate: float, updated_by: str = ""):
        self.ensure_funnel_schema()
        now = datetime.now()
        model = model_name if scope_type == "model" else ""
        conn = self.get_connection()
        conn.execute("""
            INSERT INTO funnel_conversion_rates
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (year_month, scope_type, model_name) DO UPDATE SET
                conversion_rate = excluded.conversion_rate,
                updated_by = excluded.updated_by,
                updated_at = excluded.updated_at
        """, [year_month, scope_type, model, conversion_rate, updated_by, now, now])
        conn.commit()
        self.compute_funnel_targets(year_month)

    def _overdue_time_sql(self, expression: str) -> str:
        return f"""
            TRY_CAST(NULLIF(TRIM(
                CASE
                    WHEN CAST({expression} AS VARCHAR) LIKE '%/%'
                        THEN replace(CAST({expression} AS VARCHAR), '/', '-')
                    ELSE CAST({expression} AS VARCHAR)
                END
            ), '') AS TIMESTAMP)
        """

    def ensure_dealer_overdue_table(self, conn):
        conn.execute("""
            CREATE TABLE IF NOT EXISTS mart_dealer_overdue_leads (
                region VARCHAR,
                zone VARCHAR,
                dealer_id VARCHAR,
                dealer_name VARCHAR,
                lead_id VARCHAR,
                assign_date DATE,
                assign_time TIMESTAMP,
                follow_cutoff_time TIMESTAMP,
                timely_follow_text VARCHAR,
                first_follow_time TIMESTAMP,
                follow2_time TIMESTAMP,
                follow3_time TIMESTAMP,
                lead_status VARCHAR,
                channel_1 VARCHAR,
                channel_2 VARCHAR,
                channel_3 VARCHAR,
                follower VARCHAR,
                follower_id VARCHAR,
                created_at TIMESTAMP,
                updated_at TIMESTAMP
            )
        """)

    def _populate_dealer_overdue_leads(self, conn, sqlite_path: str):
        assign_time = self._overdue_time_sql('s."最终下发时间"')
        cutoff_time = self._overdue_time_sql('s."跟进截止时间"')
        first_follow_time = self._overdue_time_sql('s."首跟时间"')
        follow2_time = self._overdue_time_sql('s."二跟时间"')
        follow3_time = self._overdue_time_sql('s."三跟时间"')
        followup_created_time = self._overdue_time_sql('f."创建时间"')

        self.ensure_dealer_overdue_table(conn)
        conn.execute("DELETE FROM mart_dealer_overdue_leads")
        conn.execute(f"""
            INSERT INTO mart_dealer_overdue_leads
            WITH first_follow_user AS (
                SELECT
                    sub.lead_id,
                    sub.follower,
                    sub.follower_id
                FROM (
                    SELECT
                        CAST(f."门店线索id" AS VARCHAR) AS lead_id,
                        COALESCE(NULLIF(TRIM(CAST(p."姓名" AS VARCHAR)), ''), CAST(f."跟进人" AS VARCHAR)) AS follower,
                        CAST(f."跟进人" AS VARCHAR) AS follower_id,
                        ROW_NUMBER() OVER (
                            PARTITION BY CAST(f."门店线索id" AS VARCHAR)
                            ORDER BY {followup_created_time} ASC NULLS LAST, CAST(f."id" AS VARCHAR) ASC
                        ) AS rn
                    FROM sqlite_scan('{sqlite_path}', '跟进表') f
                    LEFT JOIN sqlite_scan('{sqlite_path}', '人员表') p
                        ON CAST(f."跟进人" AS VARCHAR) = CAST(p."员工编号" AS VARCHAR)
                ) sub
                WHERE sub.rn = 1
            )
            SELECT
                COALESCE(NULLIF(TRIM(CAST(s."大区" AS VARCHAR)), ''), CAST(d."大区" AS VARCHAR)) AS region,
                CAST(d."战区" AS VARCHAR) AS zone,
                CAST(s."门店" AS VARCHAR) AS dealer_id,
                COALESCE(NULLIF(TRIM(CAST(s."店简称" AS VARCHAR)), ''), CAST(d."店简称" AS VARCHAR)) AS dealer_name,
                CAST(s."id" AS VARCHAR) AS lead_id,
                CAST({assign_time} AS DATE) AS assign_date,
                {assign_time} AS assign_time,
                {cutoff_time} AS follow_cutoff_time,
                CAST(s."是否及时跟进" AS VARCHAR) AS timely_follow_text,
                {first_follow_time} AS first_follow_time,
                {follow2_time} AS follow2_time,
                {follow3_time} AS follow3_time,
                CAST(s."线索状态" AS VARCHAR) AS lead_status,
                CAST(s."一级渠道" AS VARCHAR) AS channel_1,
                CAST(s."二级渠道" AS VARCHAR) AS channel_2,
                CAST(s."三级渠道" AS VARCHAR) AS channel_3,
                ffu.follower,
                ffu.follower_id,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            FROM sqlite_scan('{sqlite_path}', '线索表') s
            LEFT JOIN sqlite_scan('{sqlite_path}', '门店表') d
                ON CAST(s."门店" AS VARCHAR) = CAST(d."店编号" AS VARCHAR)
            LEFT JOIN first_follow_user ffu
                ON CAST(s."id" AS VARCHAR) = ffu.lead_id
            WHERE CAST(s."一级渠道" AS VARCHAR) = '线上'
              AND {cutoff_time} IS NOT NULL
              AND CAST(s."是否及时跟进" AS VARCHAR) = '否'
        """)
        for index_sql in [
            "CREATE INDEX IF NOT EXISTS idx_overdue_assign_date ON mart_dealer_overdue_leads(assign_date)",
            "CREATE INDEX IF NOT EXISTS idx_overdue_dealer_id ON mart_dealer_overdue_leads(dealer_id)",
            "CREATE INDEX IF NOT EXISTS idx_overdue_region_zone ON mart_dealer_overdue_leads(region, zone)",
        ]:
            try:
                conn.execute(index_sql)
            except Exception:
                pass
        count = conn.execute("SELECT COUNT(*) FROM mart_dealer_overdue_leads").fetchone()[0]
        print(f"  Dealer overdue lead records: {count}")

    def refresh_dealer_overdue_leads(self, sqlite_db_path: Path = RAW_DB_PATH):
        """Materialize first-follow overdue lead details for fast dealer queries."""
        sqlite_path = str(sqlite_db_path)
        with duckdb.connect(str(self.db_path)) as conn:
            self._populate_dealer_overdue_leads(conn, sqlite_path)

    def ensure_dealer_overdue_data(self, sqlite_db_path: Path = RAW_DB_PATH):
        conn = self.get_connection()
        self.ensure_dealer_overdue_table(conn)
        count = conn.execute("SELECT COUNT(*) FROM mart_dealer_overdue_leads").fetchone()[0]
        if count == 0:
            self.close()
            self.refresh_dealer_overdue_leads(sqlite_db_path)

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
                    dealer.get("线索运营区域负责人", ""),
                    dealer.get("线索运营-区域支持", ""),
                    is_key_store, "商贸重点店" if is_key_store else None,
                    None, dealer["rowid"],
                    now, now
                ))

            with duckdb.connect(str(self.db_path)) as conn:
                conn.executemany("""
                    INSERT INTO mart_dealers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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


                print("Loading online sales data...")
                sales_insert_sql = f"""
                INSERT INTO mart_online_sales
                SELECT
                    CAST(s."成交编号" AS VARCHAR),
                    TRY_CAST(NULLIF(TRIM(CAST(s."线索成交年月日" AS VARCHAR)), '') AS TIMESTAMP),
                    CAST(s."成交号码" AS VARCHAR),
                    CAST(s."线索成交数" AS VARCHAR),
                    CAST(s."线索成交判断" AS VARCHAR),
                    CAST(s."成交大区" AS VARCHAR),
                    CAST(s."成交省份" AS VARCHAR),
                    CAST(s."成交城市" AS VARCHAR),
                    CAST(s."成交店简称" AS VARCHAR),
                    CAST(s."成交店编号" AS VARCHAR),
                    CAST(s."实销成交车系" AS VARCHAR),
                    TRY_CAST(NULLIF(TRIM(CAST(s."线索创建时间" AS VARCHAR)), '') AS TIMESTAMP),
                    CAST(s."线索下发前大区" AS VARCHAR),
                    CAST(s."线索下发前省份" AS VARCHAR),
                    CAST(s."线索下发前城市" AS VARCHAR),
                    CAST(s."线索下发后大区" AS VARCHAR),
                    CAST(s."线索下发后省份" AS VARCHAR),
                    CAST(s."线索下发后城市" AS VARCHAR),
                    CAST(s."线索经销商编号" AS VARCHAR),
                    CAST(s."线索经销商" AS VARCHAR),
                    CAST(s."线索下发状态" AS VARCHAR),
                    CAST(s."一级渠道" AS VARCHAR),
                    CAST(s."二级渠道" AS VARCHAR),
                    CAST(s."三级渠道" AS VARCHAR),
                    CAST(s."四级渠道" AS VARCHAR),
                    TRY_CAST(NULLIF(TRIM(CAST(s."线索下发时间" AS VARCHAR)), '') AS TIMESTAMP),
                    CAST(s."线索邀约结果（店端）" AS VARCHAR),
                    CAST(s."原始意向车系" AS VARCHAR),
                    CAST(s."邀约后意向车系" AS VARCHAR),
                    CAST(s."是否到店（第一种）" AS VARCHAR),
                    CAST(s."是否参与计算" AS VARCHAR),
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                FROM sqlite_scan('{sqlite_path}', '线上实销表') s
                """
                conn.execute(sales_insert_sql)
                sales_count = conn.execute("SELECT COUNT(*) FROM mart_online_sales").fetchone()[0]
                print(f"  Online sales records loaded: {sales_count}")

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
                    CAST(f."意向车系" AS VARCHAR),
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

                print("Materializing dealer overdue lead details...")
                self._populate_dealer_overdue_leads(conn, sqlite_path)

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
                    CAST(f."意向车系" AS VARCHAR),
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

                print("Refreshing dealer overdue lead details...")
                self._populate_dealer_overdue_leads(conn, sqlite_path)

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


                print("Loading incremental online sales data...")
                conn.execute(f"""
                    DELETE FROM mart_online_sales
                """)
                conn.execute(f"""
                    INSERT INTO mart_online_sales
                    SELECT
                        CAST(s."成交编号" AS VARCHAR),
                        TRY_CAST(NULLIF(TRIM(CAST(s."线索成交年月日" AS VARCHAR)), '') AS TIMESTAMP),
                        CAST(s."成交号码" AS VARCHAR),
                        CAST(s."线索成交数" AS VARCHAR),
                        CAST(s."线索成交判断" AS VARCHAR),
                        CAST(s."成交大区" AS VARCHAR),
                        CAST(s."成交省份" AS VARCHAR),
                        CAST(s."成交城市" AS VARCHAR),
                        CAST(s."成交店简称" AS VARCHAR),
                        CAST(s."成交店编号" AS VARCHAR),
                        CAST(s."实销成交车系" AS VARCHAR),
                        TRY_CAST(NULLIF(TRIM(CAST(s."线索创建时间" AS VARCHAR)), '') AS TIMESTAMP),
                        CAST(s."线索下发前大区" AS VARCHAR),
                        CAST(s."线索下发前省份" AS VARCHAR),
                        CAST(s."线索下发前城市" AS VARCHAR),
                        CAST(s."线索下发后大区" AS VARCHAR),
                        CAST(s."线索下发后省份" AS VARCHAR),
                        CAST(s."线索下发后城市" AS VARCHAR),
                        CAST(s."线索经销商编号" AS VARCHAR),
                        CAST(s."线索经销商" AS VARCHAR),
                        CAST(s."线索下发状态" AS VARCHAR),
                        CAST(s."一级渠道" AS VARCHAR),
                        CAST(s."二级渠道" AS VARCHAR),
                        CAST(s."三级渠道" AS VARCHAR),
                        CAST(s."四级渠道" AS VARCHAR),
                        TRY_CAST(NULLIF(TRIM(CAST(s."线索下发时间" AS VARCHAR)), '') AS TIMESTAMP),
                        CAST(s."线索邀约结果（店端）" AS VARCHAR),
                        CAST(s."原始意向车系" AS VARCHAR),
                        CAST(s."邀约后意向车系" AS VARCHAR),
                        CAST(s."是否到店（第一种）" AS VARCHAR),
                        CAST(s."是否参与计算" AS VARCHAR),
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    FROM sqlite_scan('{sqlite_path}', '线上实销表') s
                """)
                sales_count = conn.execute("SELECT COUNT(*) FROM mart_online_sales").fetchone()[0]
                print(f"  Online sales records (incremental): {sales_count}")

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
            date_where = ""
            date_and = ""
            if date_str:
                date_where = f" WHERE assign_date = DATE '{date_str}'"
                date_and = f" AND assign_date = DATE '{date_str}'"

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
                {date_where}
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
                {date_where}
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
                {date_and}
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
                    {date_and}
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
            if date_str:
                target_date = date_str
            else:
                result = conn.execute("SELECT MAX(assign_date) FROM mart_leads WHERE channel_1 = '线上'").fetchone()
                target_date = str(result[0]) if result and result[0] else (now - timedelta(days=1)).strftime("%Y-%m-%d")
            cutoff_time = f"{target_date} 18:00:00"
            cutoff_dt = datetime.strptime(cutoff_time, "%Y-%m-%d %H:%M:%S")
            cutoff_time_72h = (cutoff_dt - timedelta(hours=72)).strftime("%Y-%m-%d %H:%M:%S")
            target_dt = datetime.strptime(target_date, "%Y-%m-%d")
            month_start = f"{target_dt.year}-{target_dt.month:02d}-01"

            conn.execute(f"DELETE FROM report_dealer_daily WHERE period_type = 'daily'")
            conn.execute(f"DELETE FROM report_dealer_daily WHERE period_type = 'monthly'")

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
                    FROM fact_daily_visit WHERE period_type = 'daily' AND channel_1 = '线上'
                    GROUP BY dealer_id, visit_date
                ),
                shop_monthly AS (
                    SELECT dealer_id, SUM(unique_lead_count) as visit_count
                    FROM fact_daily_visit WHERE period_type = 'daily' AND channel_1 = '线上'
                      AND visit_date >= DATE '{month_start}' AND visit_date <= DATE '{target_date}'
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
                    0 AS m_follow_30min_task_count,
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
                    0 AS m_new_media_self_valid_lead_count,
                    0 AS m_new_media_self_lead_count,
                    SUM(CASE WHEN db.invite_intent = 'AION N60' AND db.follow_cutoff_time IS NOT NULL THEN 1 ELSE 0 END) AS d_n60_lead_count,
                    SUM(CASE WHEN db.invite_intent = 'AION N60'
                              AND db.follow_cutoff_time IS NOT NULL
                              AND db.is_followed_in_30min THEN 1 ELSE 0 END) AS d_n60_follow_30min_count,

                    COUNT(*) AS d_lead_count,
                    SUM(CASE WHEN db.is_followed_in_30min THEN 1 ELSE 0 END) AS d_follow_30min_count,
                    SUM(CASE WHEN db.channel_1 = '线上' AND db.follow_cutoff_time IS NOT NULL THEN 1 ELSE 0 END) AS d_follow_30min_task_count,
                    CASE WHEN SUM(CASE WHEN db.channel_1 = '线上' AND db.follow_cutoff_time IS NOT NULL THEN 1 ELSE 0 END) > 0
                        THEN SUM(CASE WHEN db.is_followed_in_30min THEN 1 ELSE 0 END) * 100.0 / SUM(CASE WHEN db.channel_1 = '线上' AND db.follow_cutoff_time IS NOT NULL THEN 1 ELSE 0 END)
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

                    0 AS m_online_sales_count,
                    0.0 AS m_online_sales_rate,
                    NULL AS m_to_shop_conversion_rate,
                    0.0 AS m_expected_to_shop,
                    0.0 AS m_to_shop_diff,
                    NULL AS m_to_shop_eval,

                    SUM(CASE WHEN db.follow_cutoff_time IS NOT NULL
                              AND db.channel_1 = '线上'
                              AND db.lead_status NOT IN ('异地', '无效', '未跟进')
                              AND (db.channel_2 = '新媒体-经销店' OR (db.channel_2 = '新媒体' AND db.channel_3 LIKE '%经销商%'))
                         THEN 1 ELSE 0 END) AS d_new_media_self_valid_lead_count,
                    SUM(CASE WHEN db.follow_cutoff_time IS NOT NULL
                              AND db.channel_1 = '线上'
                              AND (db.channel_2 = '新媒体-经销店' OR (db.channel_2 = '新媒体' AND db.channel_3 LIKE '%经销商%'))
                         THEN 1 ELSE 0 END) AS d_new_media_self_lead_count,

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

                    SUM(CASE WHEN mb.invite_intent = 'AION N60' AND mb.follow_cutoff_time IS NOT NULL THEN 1 ELSE 0 END) AS m_n60_lead_count,
                    SUM(CASE WHEN mb.invite_intent = 'AION N60'
                              AND mb.follow_cutoff_time IS NOT NULL
                              AND mb.is_followed_in_30min THEN 1 ELSE 0 END) AS m_n60_follow_30min_count,

                    COUNT(*) AS m_lead_count,
                    SUM(CASE WHEN mb.is_followed_in_30min THEN 1 ELSE 0 END) AS m_follow_30min_count,
                    SUM(CASE WHEN mb.channel_1 = '线上' AND mb.follow_cutoff_time IS NOT NULL THEN 1 ELSE 0 END) AS m_follow_30min_task_count,
                    CASE WHEN SUM(CASE WHEN mb.channel_1 = '线上' AND mb.follow_cutoff_time IS NOT NULL THEN 1 ELSE 0 END) > 0
                        THEN SUM(CASE WHEN mb.is_followed_in_30min THEN 1 ELSE 0 END) * 100.0 / SUM(CASE WHEN mb.channel_1 = '线上' AND mb.follow_cutoff_time IS NOT NULL THEN 1 ELSE 0 END)
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

                    SUM(CASE WHEN mb.follow_cutoff_time IS NOT NULL
                              AND mb.channel_1 = '线上'
                              AND mb.lead_status NOT IN ('异地', '无效', '未跟进')
                              AND (mb.channel_2 = '新媒体-经销店' OR (mb.channel_2 = '新媒体' AND mb.channel_3 LIKE '%经销商%'))
                         THEN 1 ELSE 0 END) AS m_new_media_self_valid_lead_count,
                    SUM(CASE WHEN mb.follow_cutoff_time IS NOT NULL
                              AND mb.channel_1 = '线上'
                              AND (mb.channel_2 = '新媒体-经销店' OR (mb.channel_2 = '新媒体' AND mb.channel_3 LIKE '%经销商%'))
                         THEN 1 ELSE 0 END) AS m_new_media_self_lead_count,

                       0 AS d_n60_lead_count, 0 AS d_n60_follow_30min_count,
                    0 AS d_lead_count, 0 AS d_follow_30min_count, 0 AS d_follow_30min_task_count, 0.0 AS d_follow_30min_rate,
                    0 AS d_3day_3follow_task_count, 0 AS d_3day_3follow_count, 0.0 AS d_3day_3follow_rate,
                    0 AS d_valid_lead_count, 0.0 AS d_valid_lead_rate,
                    0 AS d_valid_local_lead_count, 0 AS d_local_lead_count,
                    0 AS d_to_shop_count, 0.0 AS d_lead_to_shop_rate, 0.0 AS d_local_lead_to_shop_rate, 0.0 AS d_valid_lead_to_shop_rate, 0.0 AS d_valid_local_lead_to_shop_rate,

                    0 AS m_online_sales_count,
                    0.0 AS m_online_sales_rate,
                    NULL AS m_to_shop_conversion_rate,
                    0.0 AS m_expected_to_shop,
                    0.0 AS m_to_shop_diff,
                    NULL AS m_to_shop_eval,

                    0 AS d_new_media_self_valid_lead_count, 0 AS d_new_media_self_lead_count,

                    CURRENT_TIMESTAMP AS created_at,
                    CURRENT_TIMESTAMP AS updated_at
                FROM monthly_base mb
                LEFT JOIN shop_monthly sm ON mb.dealer_id = sm.dealer_id
                GROUP BY mb.dealer_id, mb.dealer_name, mb.region, mb.zone, mb.province, mb.region_manager, mb.zone_manager, mb.inspector, sm.visit_count
            """)


            print("Computing online sales metrics (monthly)...")
            conn.execute(f"""
                WITH sales_agg AS (
                    SELECT
                        CAST(s.dealer_id AS VARCHAR) AS dealer_id,
                        CAST(s.sales_date AS DATE) AS sales_date,
                        COUNT(*) AS sales_count
                    FROM mart_online_sales s
                    WHERE s.is_converted = '1'
                      AND s.is_counted = '是'
                      AND CAST(s.sales_date AS DATE) >= DATE '{month_start}'
                      AND CAST(s.sales_date AS DATE) <= DATE '{target_date}'
                    GROUP BY dealer_id, CAST(s.sales_date AS DATE)
                ),
                monthly_sales AS (
                    SELECT dealer_id, SUM(sales_count) AS total_sales
                    FROM sales_agg
                    GROUP BY dealer_id
                )
                UPDATE report_dealer_daily r
                SET
                    m_online_sales_count = COALESCE(ms.total_sales, 0),
                    m_online_sales_rate = CASE WHEN r.m_local_lead_count > 0 THEN COALESCE(ms.total_sales, 0) * 100.0 / r.m_local_lead_count ELSE 0 END,
                    m_to_shop_conversion_rate = CASE WHEN r.m_to_shop_count > 0 THEN COALESCE(ms.total_sales, 0) * 100.0 / r.m_to_shop_count ELSE NULL END,
                    m_expected_to_shop = COALESCE(ms.total_sales, 0) * 4.0,
                    m_to_shop_diff = r.m_to_shop_count - (COALESCE(ms.total_sales, 0) * 4.0),
                    m_to_shop_eval = CASE
                        WHEN COALESCE(ms.total_sales, 0) = 0 THEN '无'
                        WHEN r.m_to_shop_count > 2 * (COALESCE(ms.total_sales, 0) * 4.0) THEN '到店转化率低'
                        WHEN r.m_to_shop_count >= 0.6 * (COALESCE(ms.total_sales, 0) * 4.0) THEN '正常'
                        ELSE '到店录入存在问题'
                    END
                FROM monthly_sales ms
                WHERE r.dealer_id = ms.dealer_id
                  AND r.period_type = 'monthly'
                  AND r.report_date = DATE '{month_start}'
            """)

            conn.commit()
            print("Metrics computed!")
            self.compute_funnel_metrics(target_dt.strftime("%Y-%m"))

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
        conn = duckdb.connect(str(self.db_path))

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

        def scalar_or_zero(query: str, params=None):
            row = conn.execute(query, params or []).fetchone()
            return row[0] if row and row[0] is not None else 0

        year_start = f"{current_year}-01-01"
        yesterday_str = yesterday.strftime("%Y-%m-%d")
        yearly_leads = scalar_or_zero("""
            SELECT COUNT(*) FROM mart_leads
            WHERE assign_date >= ? AND channel_1 = '线上'
        """, [year_start])

        month_start = f"{current_year}-{current_month:02d}-01"
        monthly_leads = scalar_or_zero("""
            SELECT COUNT(*) FROM mart_leads
            WHERE assign_date >= ? AND channel_1 = '线上'
        """, [month_start])

        yearly_shop = scalar_or_zero("""
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
        """, [year_start, yesterday_str])

        monthly_shop = scalar_or_zero("""
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
        """, [month_start, yesterday_str])

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

        def scalar_or_zero(query: str):
            row = conn.execute(query).fetchone()
            return row[0] if row and row[0] is not None else 0

        total_leads = scalar_or_zero(f"""
            SELECT COUNT(*) FROM mart_leads WHERE {where_clause}
        """)

        valid_leads = scalar_or_zero(f"""
            SELECT COUNT(*) FROM mart_leads
            WHERE {where_clause} AND lead_status NOT IN ('异地', '无效')
        """)

        dealer_leads = scalar_or_zero(f"""
            SELECT COUNT(*) FROM mart_leads
            WHERE {where_clause} AND dealer_id IN (SELECT dealer_id FROM mart_dealers)
        """)

        dealer_valid_leads = scalar_or_zero(f"""
            SELECT COUNT(*) FROM mart_leads
            WHERE {where_clause}
            AND dealer_id IN (SELECT dealer_id FROM mart_dealers)
            AND lead_status NOT IN ('异地', '无效')
        """)

        return {
            "total_leads": total_leads or 0,
            "valid_leads": valid_leads or 0,
            "dealer_leads": dealer_leads or 0,
            "dealer_valid_leads": dealer_valid_leads or 0
        }
