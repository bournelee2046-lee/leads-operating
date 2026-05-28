#!/usr/bin/env python3
"""
测试数据库连接是否正确关闭，防止锁定
"""

import sys
import os
import sqlite3
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from backend.core.db_manager import RawDBManager
from backend.config import RAW_DB_PATH

def test_raw_db_manager():
    """测试 RawDBManager 的连接管理"""
    print("=" * 60)
    print("测试 RawDBManager 连接管理")
    print("=" * 60)
    
    raw_db = RawDBManager()
    
    # 测试多次查询
    print("\n1. 测试多次查询...")
    for i in range(3):
        try:
            dealers = raw_db.get_dealers()
            print(f"   查询 {i+1} 成功，找到 {len(dealers)} 个经销商")
        except Exception as e:
            print(f"   查询 {i+1} 失败: {e}")
            return False
    
    # 测试获取日期范围
    print("\n2. 测试获取日期范围...")
    try:
        date_range = raw_db.get_date_range()
        print(f"   成功: {date_range[0]} 到 {date_range[1]}")
    except Exception as e:
        print(f"   失败: {e}")
        return False
    
    # 测试最新和最早时间
    print("\n3. 测试获取同步时间...")
    try:
        latest = raw_db.get_latest_sync_time()
        earliest = raw_db.get_earliest_data_time()
        print(f"   最新同步时间: {latest}")
        print(f"   最早数据时间: {earliest}")
    except Exception as e:
        print(f"   失败: {e}")
        return False
    
    print("\n✅ RawDBManager 测试通过！")
    return True

def test_direct_sqlite_access():
    """测试直接访问 SQLite 数据库是否被锁定"""
    print("\n" + "=" * 60)
    print("测试原始数据库是否可被其他程序访问")
    print("=" * 60)
    
    try:
        # 尝试直接打开数据库
        conn = sqlite3.connect(str(RAW_DB_PATH), timeout=5.0)
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM 线索表")
        count = cursor.fetchone()[0]
        conn.close()
        print(f"\n✅ 数据库可以被正常访问，线索表包含 {count:,} 条记录")
        return True
    except sqlite3.OperationalError as e:
        if "database is locked" in str(e):
            print(f"\n❌ 数据库被锁定: {e}")
            return False
        else:
            print(f"\n⚠️  访问数据库时出错: {e}")
            return False
    except Exception as e:
        print(f"\n❌ 其他错误: {e}")
        return False

def main():
    print("\n线索运营监控系统 - 数据库锁定测试\n")
    
    # 测试 1: RawDBManager
    test1 = test_raw_db_manager()
    
    # 测试 2: 直接访问
    test2 = test_direct_sqlite_access()
    
    print("\n" + "=" * 60)
    if test1 and test2:
        print("✅ 所有测试通过！数据库锁定问题已修复。")
    else:
        print("❌ 部分测试失败，请检查。")
    print("=" * 60)
    
    return 0 if test1 and test2 else 1

if __name__ == "__main__":
    sys.exit(main())
