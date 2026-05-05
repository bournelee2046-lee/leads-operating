#!/usr/bin/env python3
"""Explore lead fields"""

import sys
from pathlib import Path

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from backend.core.db_manager import RawDBManager

db = RawDBManager()
conn = db.get_connection()

print("线索表所有字段:")
cursor = conn.execute("PRAGMA table_info(线索表)")
for row in cursor.fetchall():
    print(f"  {row[1]} ({row[2]})")

print("\n线索状态的前10个不同值:")
cursor = conn.execute("SELECT DISTINCT 线索状态 FROM 线索表 WHERE 线索状态 IS NOT NULL LIMIT 10")
for row in cursor.fetchall():
    print(f"  - {row[0]}")

print("\n查看1条线索的完整字段:")
cursor = conn.execute("SELECT * FROM 线索表 LIMIT 1")
cols = [desc[0] for desc in cursor.description]
row = cursor.fetchone()
print("  字段详情:")
for col, val in zip(cols, row):
    print(f"    {col}: {val}")

conn.close()

print("\n✅ Done!")
