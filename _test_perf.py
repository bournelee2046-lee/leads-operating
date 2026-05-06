import duckdb, time

full_path = '/Users/bournelll/Desktop/线索运营/leads.db'
conn = duckdb.connect(':memory:')

conn.execute('''
CREATE TABLE mart_leads_test (
    lead_id VARCHAR, phone VARCHAR, dealer_id VARCHAR, dealer_name VARCHAR,
    region VARCHAR, province VARCHAR, city VARCHAR,
    channel_1 VARCHAR, channel_2 VARCHAR, channel_3 VARCHAR, channel_4 VARCHAR,
    assign_date DATE, assign_time TIMESTAMP,
    first_follow_date DATE, first_follow_time TIMESTAMP,
    is_followed_in_30min BOOLEAN, follow_count INTEGER, lead_status VARCHAR,
    is_converted BOOLEAN, conversion_date DATE, conversion_model VARCHAR,
    days_to_convert INTEGER, is_to_shop BOOLEAN, is_test_drive BOOLEAN,
    is_ordered BOOLEAN, created_at TIMESTAMP, updated_at TIMESTAMP
)
''')

t0 = time.time()
conn.execute(f"""
INSERT INTO mart_leads_test
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

elapsed = time.time() - t0
count = conn.execute('SELECT COUNT(*) FROM mart_leads_test').fetchone()[0]
sample = conn.execute('SELECT lead_id, dealer_name, assign_date, is_followed_in_30min, is_converted FROM mart_leads_test LIMIT 3').fetchall()
print(f'DuckDB直读+转换 INSERT...SELECT: {count} 行, 耗时 {elapsed:.3f}s')
print(f'速度: {count/elapsed:.0f} 行/秒')
for row in sample:
    print(f'  示例: {row}')
conn.close()
