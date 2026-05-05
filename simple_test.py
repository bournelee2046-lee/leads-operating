#!/usr/bin/env python3
"""Simple init test"""

import sys
from pathlib import Path

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from backend.app_v2 import init_system
import requests

print("Calling init_system...")
result = init_system(force_refresh=True)
print(f"✅ Init result: {result}")
print("\nNow check the dashboard...")
try:
    response = requests.get("http://localhost:5001/api/health", timeout=5)
    print(f"✅ Health check: {response.status_code} - {response.text}")
    
    dashboard_response = requests.get("http://localhost:5001/api/dashboard", timeout=5)
    dashboard_data = dashboard_response.json()
    print(f"✅ Dashboard success: {dashboard_data.get('success')}")
    print(f"  KPI count: {len(dashboard_data.get('data', {}).get('kpis', []))}")
    print(f"  KPI list:")
    for kpi in dashboard_data.get('data', {}).get('kpis', []):
        print(f"    - {kpi.get('display_name')}: {kpi.get('value')}")
except Exception as e:
    print(f"⚠️ Health check failed: {e}")

print("\n✅ Test completed!")
