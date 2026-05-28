#!/usr/bin/env python3
"""
快速测试中间层架构
"""

import sys
from pathlib import Path

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

print("=" * 60)
print("测试中间层架构")
print("=" * 60)

# 导入模块
try:
    from backend.core.db_manager import RawDBManager
    from backend.core.duckdb_manager import DuckDBManager
    print("✓ 模块导入成功")
except Exception as e:
    print(f"✗ 模块导入失败: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# 测试原始数据层
print("\n1. 测试原始数据层 (SQLite)")
try:
    raw_db = RawDBManager()
    dealers = raw_db.get_dealers()
    print(f"  ✓ 经销商数据: {len(dealers)} 条")

    date_range = raw_db.get_date_range()
    print(f"  ✓ 日期范围: {date_range}")

except Exception as e:
    print(f"  ✗ 错误: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# 测试 DuckDB 层
print("\n2. 初始化数据集市")
try:
    duck_db = DuckDBManager()
    duck_db.initialize()

    print("  - 从 SQLite 加载数据...")
    duck_db.load_from_sqlite()
    stats = duck_db.get_count_stats()
    print(f"  ✓ Leads: {stats['leads']:,}")
    print(f"  ✓ Dealers: {stats['dealers']}")

except Exception as e:
    print(f"  ✗ 错误: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# 计算指标
print("\n3. 计算指标")
try:
    duck_db.compute_all_metrics()

    stats = duck_db.get_count_stats()
    print(f"  ✓ Metrics: {stats['metrics']:,}")

except Exception as e:
    print(f"  ✗ 错误: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

# 测试仪表盘数据
print("\n4. 测试仪表盘数据")
try:
    data = duck_db.get_dashboard_data()
    print(f"  ✓ KPI 数量: {len(data['kpis'])}")
    print(f"  ✓ 来源分布: {len(data['source_distribution'])} 个")
    print(f"  ✓ 趋势数据: {len(data['trend_data'])} 周")
    print(f"  ✓ 经销商排名: {len(data['dealer_ranking'])} 家")

except Exception as e:
    print(f"  ✗ 错误: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

print("\n" + "=" * 60)
print("所有测试通过！架构运行正常。")
print("=" * 60)
print("\n数据文件位置:")
print(f"  - DuckDB: {project_root / 'data' / 'leads_analytics.db'}")
print("\n下一步: 运行 '启动服务.command' 启动完整系统")
