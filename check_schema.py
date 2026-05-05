#!/usr/bin/env python3
"""检查数据库表结构"""

from backend.core.db_manager import RawDBManager

db = RawDBManager()

print("线索表字段:")
conn = db.get_connection()
cursor = conn.cursor()
cursor.execute("PRAGMA table_info(线索表)")
for row in cursor.fetchall():
    print(f"  {row[1]} ({row[2]})")

print("\n前3条数据示例:")
cursor.execute("SELECT * FROM 线索表 LIMIT 3")
rows = cursor.fetchall()
for row in rows:
    print(f"  {dict(row)}")
conn.close()
