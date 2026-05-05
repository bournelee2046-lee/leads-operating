#!/usr/bin/env python3
"""Debug script to test the database initialization"""

import sys
from pathlib import Path

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

print("=" * 60)
print("Testing database initialization...")
print("=" * 60)

from backend.core.duckdb_manager import DuckDBManager
import duckdb

# Remove old database
db_path = Path("data/leads_analytics.db")
if db_path.exists():
    print("Removing old database...")
    db_path.unlink()

# Initialize manager
print("Creating DuckDBManager...")
manager = DuckDBManager(db_path)

print("Calling initialize...")
try:
    manager.initialize()
    print("✓ initialize() done")
    
    print("\nCalling load_from_sqlite...")
    manager.load_from_sqlite()
    print("✓ load_from_sqlite() done")
    
    print("\nCalling compute_all_metrics...")
    manager.compute_all_metrics()
    print("✓ compute_all_metrics() done")
    
    print("\nTesting get_dashboard_data...")
    data = manager.get_dashboard_data()
    print(f"✓ Dashboard data loaded, keys: {list(data.keys())}")
    print(f"  Latest sync time: {data.get('latest_sync_time')}")
    
    print("\n" + "=" * 60)
    print("✓ All tests passed!")
    print("=" * 60)
    
except Exception as e:
    print(f"\n✗ Error: {e}")
    import traceback
    traceback.print_exc()
