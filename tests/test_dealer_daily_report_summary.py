import math
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from backend.app_v2 import _summarize_dealer_report_rows


def assert_close(actual, expected):
    assert math.isclose(actual, expected, rel_tol=1e-9, abs_tol=1e-9)


def test_custom_range_summary_aggregates_dealer_rows_once():
    rows = [
        {
            "dealer_id": "A",
            "n60_lead_count": 2,
            "n60_follow_30min_count": 1,
            "lead_count": 10,
            "follow_30min_count": 8,
            "follow_30min_task_count": 10,
            "day3_3follow_task_count": 9,
            "day3_3follow_count": 6,
            "valid_lead_count": 5,
            "valid_local_lead_count": 4,
            "local_lead_count": 8,
            "to_shop_count": 3,
            "new_media_self_valid_lead_count": 2,
            "new_media_self_lead_count": 3,
            "online_sales_count": 1,
        },
        {
            "dealer_id": "B",
            "n60_lead_count": 1,
            "n60_follow_30min_count": 1,
            "lead_count": 20,
            "follow_30min_count": 10,
            "follow_30min_task_count": 20,
            "day3_3follow_task_count": 10,
            "day3_3follow_count": 5,
            "valid_lead_count": 10,
            "valid_local_lead_count": 9,
            "local_lead_count": 18,
            "to_shop_count": 7,
            "new_media_self_valid_lead_count": 3,
            "new_media_self_lead_count": 4,
            "online_sales_count": 2,
        },
    ]

    summary = _summarize_dealer_report_rows(rows)

    assert summary["lead_count"] == 30
    assert summary["valid_lead_count"] == 15
    assert summary["local_lead_count"] == 26
    assert summary["to_shop_count"] == 10
    assert summary["online_sales_count"] == 3
    assert summary["expected_to_shop"] == 12
    assert summary["to_shop_diff"] == -2
    assert summary["to_shop_eval"] == "正常"
    assert_close(summary["lead_to_shop_rate"], 10 * 100 / 30)
    assert_close(summary["valid_lead_to_shop_rate"], 10 * 100 / 15)
    assert_close(summary["online_sales_rate"], 3 * 100 / 26)
    assert_close(summary["to_shop_conversion_rate"], 3 * 100 / 10)


def test_custom_range_summary_empty_rows_has_stable_defaults():
    summary = _summarize_dealer_report_rows([])

    assert summary["lead_count"] == 0
    assert summary["to_shop_count"] == 0
    assert summary["online_sales_count"] == 0
    assert summary["lead_to_shop_rate"] == 0
    assert summary["to_shop_conversion_rate"] is None


def test_custom_range_real_duckdb_xian_dongcheng_regression():
    import shutil
    import tempfile

    import backend.app_v2 as app_v2
    from backend.core.duckdb_manager import DuckDBManager

    duckdb_path = PROJECT_ROOT / "data" / "leads_analytics.db"
    if not duckdb_path.exists():
        return

    temp_dir = tempfile.TemporaryDirectory()
    temp_duckdb_path = Path(temp_dir.name) / "leads_analytics.test.db"
    shutil.copy2(duckdb_path, temp_duckdb_path)

    previous_duck_db = app_v2.duck_db
    app_v2.duck_db = DuckDBManager(temp_duckdb_path)
    try:
        conn = app_v2.duck_db.get_connection()
        with app_v2.app.app_context():
            response = app_v2._get_dealer_report_custom_range(
                conn,
                "2026-04-25",
                "2026-05-25",
                "",
                "",
                "",
                "西安东城",
                "lead_count",
                "desc",
                1,
                50,
                "",
            )
            payload = response.get_json()
    finally:
        try:
            app_v2.duck_db.close()
        finally:
            app_v2.duck_db = previous_duck_db
            temp_dir.cleanup()

    assert payload["success"] is True
    assert len(payload["data"]) == 1

    row = payload["data"][0]
    summary = payload["summary"]
    assert row["dealer_id"] == "SNA0500"
    assert summary["lead_count"] == row["lead_count"]
    assert summary["valid_lead_count"] == row["valid_lead_count"]
    assert summary["local_lead_count"] == row["local_lead_count"]
    assert summary["to_shop_count"] == row["to_shop_count"]
    assert summary["online_sales_count"] == row["online_sales_count"]
    assert summary["to_shop_count"] < summary["lead_count"]
    assert summary["online_sales_count"] > 0
    assert_close(summary["lead_to_shop_rate"], summary["to_shop_count"] * 100 / summary["lead_count"])
    assert_close(summary["valid_lead_to_shop_rate"], summary["to_shop_count"] * 100 / summary["valid_lead_count"])
    assert_close(summary["online_sales_rate"], summary["online_sales_count"] * 100 / summary["local_lead_count"])
    assert_close(summary["to_shop_conversion_rate"], summary["online_sales_count"] * 100 / summary["to_shop_count"])
