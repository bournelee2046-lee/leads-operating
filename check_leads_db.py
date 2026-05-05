
import sqlite3
import os

# 数据库文件路径
db_path = '/Users/bournelll/Desktop/线索运营/leads.db'

print(f'检查数据库: {db_path}')
print(f'文件存在: {os.path.exists(db_path)}')

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 获取所有表
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
print(f'\n表列表:')
for table in tables:
    print(f'  - {table[0]}')

# 查看每个表的结构
if tables:
    for table in tables:
        table_name = table[0]
        print(f'\n--- 表: {table_name} ---')
        
        # 查看表结构
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = cursor.fetchall()
        print('  字段列表:')
        for col in columns:
            print(f'    {col[1]} ({col[2]})')
        
        # 查看前5条数据
        print(f'\n  前5条数据:')
        try:
            cursor.execute(f"SELECT * FROM {table_name} LIMIT 5")
            rows = cursor.fetchall()
            if rows:
                # 获取列名
                cursor.execute(f"PRAGMA table_info({table_name})")
                col_names = [col[1] for col in cursor.fetchall()]
                print(f'    列名: {col_names}')
                for i, row in enumerate(rows, 1):
                    print(f'    记录{i}: {row}')
            else:
                print('    (空表)')
        except Exception as e:
            print(f'    错误: {e}')
        
        # 查看记录总数
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            count = cursor.fetchone()[0]
            print(f'\n  总记录数: {count}')
        except Exception as e:
            print(f'  计数错误: {e}')

conn.close()
