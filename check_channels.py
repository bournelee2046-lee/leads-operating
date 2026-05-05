#!/usr/bin/env python3
"""
检查一级渠道字段和值
"""

import duckdb
from pathlib import Path

DUCKDB_PATH = Path("/Users/bournelll/Desktop/线索运营/线索运营监控系统/data/leads_analytics.db")

def main():
    conn = duckdb.connect(str(DUCKDB_PATH))
    
    print("=== mart_leads 表结构 ===")
    result = conn.execute("DESCRIBE mart_leads").fetchall()
    for col in result:
        print(f"  {col[0]}: {col[1]}")
    
    print("\n=== 一级渠道的不同值 ===")
    result = conn.execute("SELECT DISTINCT channel_1 FROM mart_leads WHERE channel_1 IS NOT NULL ORDER BY channel_1").fetchall()
    for val in result:
        print(f"  {val[0]}")
    
    print("\n=== 统计渠道数量 ===")
    result = conn.execute("SELECT channel_1, COUNT(*) FROM mart_leads WHERE channel_1 IS NOT NULL GROUP BY channel_1 ORDER BY COUNT(*) DESC").fetchall()
    for val in result:
        print(f"  {val[0]}: {val[1]:,}")
    
    conn.close()

if __name__ == "__main__":
    main()
