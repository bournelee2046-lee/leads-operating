#!/usr/bin/env python3
"""
Leads Analytics System - DuckDB Initialization Script
"""

import sys
import os
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from backend.core.duckdb_manager import DuckDBManager
from backend.core.db_manager import RawDBManager


def main():
    print("=" * 60)
    print("Leads Analytics System - Initialization")
    print("=" * 60)
    print()

    # Check database
    raw_db = RawDBManager()
    try:
        date_range = raw_db.get_date_range()
        if date_range[0]:
            print(f"Data date range: {date_range[0]} to {date_range[1]}")
        else:
            print("Warning: Could not determine date range from database")
    except Exception as e:
        print(f"Error accessing database: {e}")
        return 1

    # Initialize DuckDB
    print()
    print("Initializing DuckDB...")
    manager = DuckDBManager()

    # Setup tables
    print("  - Creating tables...")
    manager.initialize_mart()
    manager.initialize_metrics()

    # Load data
    print("  - Loading data from SQLite...")
    manager.load_from_sqlite()

    # Compute metrics
    print()
    print("Computing metrics...")
    manager.compute_daily_metrics()
    manager.compute_dealer_ranking()
    manager.compute_channel_stats()

    # Verify
    print()
    print("Verifying data...")
    try:
        mart_conn = manager.get_mart_connection()
        leads_count = mart_conn.execute("SELECT COUNT(*) FROM mart_leads").fetchone()[0]
        dealers_count = mart_conn.execute("SELECT COUNT(*) FROM mart_dealers").fetchone()[0]

        metric_conn = manager.get_metric_connection()
        metrics_count = metric_conn.execute("SELECT COUNT(*) FROM metric_daily").fetchone()[0]

        print(f"  - Leads in Mart: {leads_count:,}")
        print(f"  - Dealers in Mart: {dealers_count}")
        print(f"  - Metrics computed: {metrics_count}")

    except Exception as e:
        print(f"  - Warning: Could not verify data: {e}")

    print()
    print("=" * 60)
    print("Initialization complete!")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
