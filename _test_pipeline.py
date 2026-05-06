import duckdb, time, sqlite3
from datetime import datetime

full_path = '/Users/bournelll/Desktop/线索运营/leads.db'
test_db = '/Users/bournelll/Desktop/线索运营/线索运营监控系统/data/_test_perf.db'

print('=== 完整管性能测试 ===')
t_total = time.time()

# 1. Initialize
t0 = time.time()
conn = duckdb.connect(test_db)
tables = ["mart_dealers", "dim_dates", "mart_leads", "metric_daily", "metric_dealer_ranking", "metric_channels", "metadata"]
for t in tables:
    conn.execute(f"DROP TABLE IF EXISTS {t}")

conn.execute("CREATE TABLE metadata (key VARCHAR PRIMARY KEY, value VARCHAR, updated_at TIMESTAMP)")
conn.execute("CREATE TABLE mart_dealers (dealer_id VARCHAR, dealer_name VARCHAR, region VARCHAR, zone VARCHAR, region_manager VARCHAR, zone_manager VARCHAR, is_key_store BOOLEAN, key_store_type VARCHAR, created_at TIMESTAMP, updated_at TIMESTAMP)")
conn.execute("CREATE TABLE dim_dates (date_id DATE, year INTEGER, quarter INTEGER, month INTEGER, week INTEGER, day_of_week INTEGER, day_of_month INTEGER, is_weekend BOOLEAN, is_holiday BOOLEAN)")
conn.execute("""CREATE TABLE mart_leads (lead_id VARCHAR, phone VARCHAR, dealer_id VARCHAR, dealer_name VARCHAR,
    region VARCHAR, province VARCHAR, city VARCHAR, channel_1 VARCHAR, channel_2 VARCHAR, channel_3 VARCHAR, channel_4 VARCHAR,
    assign_date DATE, assign_time TIMESTAMP, first_follow_date DATE, first_follow_time TIMESTAMP,
    is_followed_in_30min BOOLEAN, follow_count INTEGER, lead_status VARCHAR, is_converted BOOLEAN, conversion_date DATE,
    conversion_model VARCHAR, days_to_convert INTEGER, is_to_shop BOOLEAN, is_test_drive BOOLEAN, is_ordered BOOLEAN,
    created_at TIMESTAMP, updated_at TIMESTAMP)""")
conn.execute("""CREATE TABLE metric_daily (date_id DATE, dealer_id VARCHAR, channel_1 VARCHAR, region VARCHAR,
    lead_count INTEGER, follow_in_30min_count INTEGER, follow_in_30min_rate DOUBLE, to_shop_count INTEGER, to_shop_rate DOUBLE,
    test_drive_count INTEGER, test_drive_rate DOUBLE, order_count INTEGER, conversion_count INTEGER, conversion_rate DOUBLE,
    avg_days_to_convert DOUBLE, avg_follow_count DOUBLE, created_at TIMESTAMP)""")
conn.execute("""CREATE TABLE metric_dealer_ranking (period_type VARCHAR, period_date DATE, dealer_id VARCHAR,
    dealer_name VARCHAR, region VARCHAR, rank_in_region INTEGER, rank_all INTEGER, lead_count INTEGER, conversion_count INTEGER,
    conversion_rate DOUBLE, updated_at TIMESTAMP)""")
conn.execute("""CREATE TABLE metric_channels (date_id DATE, period_type VARCHAR, channel_1 VARCHAR, channel_2 VARCHAR,
    lead_count INTEGER, lead_percentage DOUBLE, conversion_count INTEGER, conversion_rate DOUBLE, avg_days_to_convert DOUBLE)""")
print(f'  初始化表: {time.time()-t0:.3f}s')

# 2. Load dealers
t0 = time.time()
sqlite_conn = sqlite3.connect(full_path, timeout=30.0)
cursor = sqlite_conn.execute("SELECT * FROM 门店表")
dealer_rows = []
now = datetime.now()
desc = [d[0] for d in cursor.description]
for row in cursor:
    dealer = dict(zip(desc, row))
    is_key = str(dealer.get("商贸重点店", "否")) == "是"
    dealer_rows.append((dealer["店编号"], dealer["店简称"], dealer["大区"], dealer["战区"],
        dealer["大区经理"], dealer["战区经理"], is_key, "商贸重点店" if is_key else None, now, now))
conn.executemany("INSERT INTO mart_dealers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", dealer_rows)
print(f'  加载门店: {len(dealer_rows)} 行, {time.time()-t0:.3f}s')

# 3. Load leads via sqlite_scan
t0 = time.time()
conn.execute(f"""
INSERT INTO mart_leads
SELECT
    CAST(s."id" AS VARCHAR), CAST(s."手机" AS VARCHAR),
    CAST(s."门店" AS VARCHAR), CAST(s."店简称" AS VARCHAR),
    CAST(s."大区" AS VARCHAR), CAST(s."省份" AS VARCHAR),
    CAST(s."城市" AS VARCHAR),
    CAST(s."一级渠道" AS VARCHAR), CAST(s."二级渠道" AS VARCHAR),
    CAST(s."三级渠道" AS VARCHAR), CAST(s."四级渠道" AS VARCHAR),
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
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM sqlite_scan('{full_path}', '线索表') s
""")
lead_count = conn.execute("SELECT COUNT(*) FROM mart_leads").fetchone()[0]
print(f'  加载线索(sqlite_scan): {lead_count} 行, {time.time()-t0:.3f}s')

# 4. Generate date dim
t0 = time.time()
cursor = sqlite_conn.execute("SELECT MIN(DATE(下发时间)), MAX(DATE(下发时间)) FROM 线索表")
result = cursor.fetchone()
if result[0] and result[1]:
    from datetime import timedelta
    min_date = datetime.strptime(result[0][:10], "%Y-%m-%d").date()
    max_date = datetime.strptime(result[1][:10], "%Y-%m-%d").date()
    date_rows = []
    current = min_date
    while current <= max_date:
        date_rows.append((current, current.year, (current.month-1)//3+1, current.month,
                          current.isocalendar()[1], current.weekday(), current.day,
                          current.weekday() >= 5, False))
        current += timedelta(days=1)
    conn.executemany("INSERT INTO dim_dates VALUES (?,?,?,?,?,?,?,?,?)", date_rows)
print(f'  日期维度: {time.time()-t0:.3f}s')

# 5. Save metadata
t0 = time.time()
cursor = sqlite_conn.execute("SELECT MAX(最终下发时间) FROM 线索表")
latest_sync = cursor.fetchone()[0]
cursor = sqlite_conn.execute("SELECT MIN(最终下发时间) FROM 线索表")
earliest = cursor.fetchone()[0]
sqlite_conn.close()
conn.execute("INSERT INTO metadata VALUES ('latest_sync_time', ?, ?)", [str(latest_sync), now])
conn.execute("INSERT INTO metadata VALUES ('earliest_data_time', ?, ?)", [str(earliest), now])
print(f'  元数据: {time.time()-t0:.3f}s')

# 6. Compute metrics
t0 = time.time()
conn.execute("""
INSERT INTO metric_daily
SELECT assign_date, dealer_id, channel_1, region,
    COUNT(*), SUM(CASE WHEN is_followed_in_30min THEN 1 ELSE 0 END),
    AVG(CASE WHEN is_followed_in_30min THEN 1 ELSE 0 END)*100,
    SUM(CASE WHEN is_to_shop THEN 1 ELSE 0 END),
    AVG(CASE WHEN is_to_shop THEN 1 ELSE 0 END)*100,
    SUM(CASE WHEN is_test_drive THEN 1 ELSE 0 END),
    AVG(CASE WHEN is_test_drive THEN 1 ELSE 0 END)*100,
    SUM(CASE WHEN is_ordered THEN 1 ELSE 0 END),
    SUM(CASE WHEN is_converted THEN 1 ELSE 0 END),
    AVG(CASE WHEN is_converted THEN 1 ELSE 0 END)*100,
    AVG(days_to_convert), AVG(follow_count), CURRENT_TIMESTAMP
FROM mart_leads GROUP BY assign_date, dealer_id, channel_1, region
""")
conn.execute("""
INSERT INTO metric_daily
SELECT assign_date, 'all', 'all', 'all',
    COUNT(*), SUM(CASE WHEN is_followed_in_30min THEN 1 ELSE 0 END),
    AVG(CASE WHEN is_followed_in_30min THEN 1 ELSE 0 END)*100,
    SUM(CASE WHEN is_to_shop THEN 1 ELSE 0 END),
    AVG(CASE WHEN is_to_shop THEN 1 ELSE 0 END)*100,
    SUM(CASE WHEN is_test_drive THEN 1 ELSE 0 END),
    AVG(CASE WHEN is_test_drive THEN 1 ELSE 0 END)*100,
    SUM(CASE WHEN is_ordered THEN 1 ELSE 0 END),
    SUM(CASE WHEN is_converted THEN 1 ELSE 0 END),
    AVG(CASE WHEN is_converted THEN 1 ELSE 0 END)*100,
    AVG(days_to_convert), AVG(follow_count), CURRENT_TIMESTAMP
FROM mart_leads GROUP BY assign_date
""")
conn.execute("""
INSERT INTO metric_dealer_ranking
SELECT 'daily', assign_date, dealer_id, dealer_name, region,
    NULL, NULL, COUNT(*), SUM(CASE WHEN is_converted THEN 1 ELSE 0 END),
    AVG(CASE WHEN is_converted THEN 1 ELSE 0 END)*100, CURRENT_TIMESTAMP
FROM mart_leads WHERE dealer_id IS NOT NULL
GROUP BY assign_date, dealer_id, dealer_name, region
""")
conn.execute("""
INSERT INTO metric_channels
WITH ds AS (
    SELECT assign_date AS date_id, channel_1, channel_2, COUNT(*) AS lead_count,
        SUM(CASE WHEN is_converted THEN 1 ELSE 0 END) AS conversion_count,
        AVG(CASE WHEN is_converted THEN 1 ELSE 0 END)*100 AS conversion_rate,
        AVG(days_to_convert) AS avg_days_to_convert
    FROM mart_leads WHERE channel_1 IS NOT NULL
    GROUP BY assign_date, channel_1, channel_2
), dt AS (SELECT date_id, SUM(lead_count) AS total_leads FROM ds GROUP BY date_id)
SELECT ds.date_id, 'daily', ds.channel_1, ds.channel_2, ds.lead_count,
    ds.lead_count*100.0/dt.total_leads, ds.conversion_count, ds.conversion_rate, ds.avg_days_to_convert
FROM ds JOIN dt ON ds.date_id=dt.date_id
""")
conn.commit()
print(f'  计算指标: {time.time()-t0:.3f}s')

total = time.time() - t_total
stats = conn.execute("SELECT COUNT(*), (SELECT COUNT(*) FROM metric_daily), (SELECT COUNT(*) FROM metric_dealer_ranking), (SELECT COUNT(*) FROM metric_channels) FROM mart_leads").fetchone()
conn.close()

import os
os.remove(test_db)
if os.path.exists(test_db + '.wal'):
    os.remove(test_db + '.wal')

print(f'\n=== 优化后总耗时: {total:.2f}s ===')
print(f'mart_leads: {stats[0]} | metric_daily: {stats[1]} | ranking: {stats[2]} | channels: {stats[3]}')
