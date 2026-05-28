#!/usr/bin/env python3
"""测试 dashboard 数据"""

import sys
from pathlib import Path

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from backend.core.duckdb_manager import DuckDBManager

# Remove old database
db_path = Path("data/leads_analytics.db")
if db_path.exists():
    print("Removing old database...")
    db_path.unlink()

# Initialize and test
print("Creating DuckDBManager...")
manager = DuckDBManager(db_path)

print("\nCalling initialize...")
manager.initialize()

print("\nCalling load_from_sqlite...")
manager.load_from_sqlite()

print("\nCalling compute_all_metrics...")
manager.compute_all_metrics()

print("\nTesting get_dashboard_data...")
data = manager.get_dashboard_data()
print(f"Dashboard keys: {list(data.keys())}")
print(f"  Latest sync time: {data.get('latest_sync_time')}")
print(f"  Earliest data time: {data.get('earliest_data_time')}")
print(f"  KPIs: {len(data.get('kpis', []))}")
for kpi in data.get('kpis', []):
    print(f"  - {kpi['display_name']}: {kpi['value']}")

print("\n✅ All tests passed!")
