#!/usr/bin/env python3
"""
调试数据刷新功能
"""

import sys
import os
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from backend.core.duckdb_manager import DuckDBManager
from backend.config import RAW_DB_PATH

def main():
    print("=" * 80)
    print("调试数据刷新功能")
    print("=" * 80)
    
    manager = DuckDBManager()
    
    print("\n1. 检查当前数据库状态...")
    try:
        latest_sync = manager.get_metadata('latest_sync_time')
        print(f"   当前最新同步时间: {latest_sync}")
        
        conn = manager.get_connection()
        lead_count = conn.execute("SELECT COUNT(*) FROM mart_leads").fetchone()[0]
        print(f"   当前数据集市线索数: {lead_count:,}")
    except Exception as e:
        print(f"   检查失败: {e}")
    
    print("\n2. 尝试从原始数据库重新加载数据...")
    try:
        manager.initialize(drop_old=True)
        print("   ✓ 数据库表已重新创建")
        
        manager.load_from_sqlite()
        print("   ✓ 数据已从 SQLite 加载")
        
        manager.compute_all_metrics()
        print("   ✓ 指标已重新计算")
        
    except Exception as e:
        print(f"   ✗ 刷新失败: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    print("\n3. 检查刷新后的状态...")
    try:
        latest_sync = manager.get_metadata('latest_sync_time')
        print(f"   刷新后最新同步时间: {latest_sync}")
        
        earliest_time = manager.get_metadata('earliest_data_time')
        print(f"   最早数据时间: {earliest_time}")
        
        conn = manager.get_connection()
        lead_count = conn.execute("SELECT COUNT(*) FROM mart_leads").fetchone()[0]
        print(f"   刷新后数据集市线索数: {lead_count:,}")
        
        metric_count = conn.execute("SELECT COUNT(*) FROM metric_daily").fetchone()[0]
        print(f"   指标记录数: {metric_count:,}")
        
    except Exception as e:
        print(f"   检查失败: {e}")
    
    print("\n" + "=" * 80)
    print("调试完成！")
    print("=" * 80)
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
