#!/usr/bin/env python3
"""
检查数据库结构
"""

import duckdb
import sqlite3
from pathlib import Path

DUCKDB_PATH = Path("/Users/bournelll/Desktop/线索运营/线索运营监控系统/data/leads_analytics.db")
RAW_DB_PATH = Path("/Users/bournelll/Desktop/线索运营/线索运营监控系统/data/leads.db")

def main():
    print("=" * 80)
    print("检查原始数据库结构 (SQLite)")
    print("=" * 80)
    
    conn = sqlite3.connect(str(RAW_DB_PATH), timeout=30.0)
    cursor = conn.cursor()
    
    # 列出所有表
    print("\n数据库中的所有表:")
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    for t in tables:
        print(f"  - {t[0]}")
    
    # 检查每个表的结构
    for table_name in [t[0] for t in tables]:
        print(f"\n{table_name} 表结构:")
        cursor.execute(f"PRAGMA table_info({table_name})")
        for col in cursor.fetchall():
            print(f"  {col[1]}: {col[2]}")
    
    conn.close()
    
    # 检查 DuckDB 数据集市
    print("\n" + "=" * 80)
    print("检查 DuckDB 数据集市")
    print("=" * 80)
    
    duck_conn = duckdb.connect(str(DUCKDB_PATH))
    
    # 列出所有表
    print("\nDuckDB 中的所有表:")
    result = duck_conn.execute("SHOW TABLES").fetchall()
    for t in result:
        print(f"  - {t[0]}")
    
    # 检查 mart_leads 表结构
    print("\nmart_leads 表结构:")
    result = duck_conn.execute("DESCRIBE mart_leads").fetchall()
    for col in result:
        print(f"  {col[0]}: {col[1]}")
    
    # 检查 mart_dealers 表结构
    print("\nmart_dealers 表结构:")
    result = duck_conn.execute("DESCRIBE mart_dealers").fetchall()
    for col in result:
        print(f"  {col[0]}: {col[1]}")
    
    # 检查经销商数据
    print("\nmart_dealers 中的经销商样例 (前10个):")
    result = duck_conn.execute("SELECT dealer_id, dealer_name FROM mart_dealers LIMIT 10").fetchall()
    for row in result:
        print(f"  {row[0]}: {row[1]}")
    
    # 检查线索中的 dealer_id 匹配情况
    print("\nmart_leads 中的 dealer_id 匹配情况:")
    matched = duck_conn.execute("""
        SELECT COUNT(*) FROM mart_leads 
        WHERE dealer_id IN (SELECT dealer_id FROM mart_dealers)
    """).fetchone()[0]
    
    total = duck_conn.execute("SELECT COUNT(*) FROM mart_leads").fetchone()[0]
    
    print(f"  总线索数: {total:,}")
    print(f"  匹配到 mart_dealers 的线索数: {matched:,}")
    print(f"  匹配率: {matched/total*100:.2f}%")
    
    # 检查 dealer_id 为空或不为空的情况
    not_null = duck_conn.execute("SELECT COUNT(*) FROM mart_leads WHERE dealer_id IS NOT NULL AND dealer_id != ''").fetchone()[0]
    is_null = duck_conn.execute("SELECT COUNT(*) FROM mart_leads WHERE dealer_id IS NULL OR dealer_id = ''").fetchone()[0]
    
    print(f"\n  dealer_id 不为空: {not_null:,}")
    print(f"  dealer_id 为空: {is_null:,}")
    
    duck_conn.close()

if __name__ == "__main__":
    main()
