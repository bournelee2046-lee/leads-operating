import pytest

from backend.core.query_builder import (
    QueryBuilderError,
    build_aggregate_query,
    build_detail_query,
)


COLUMNS_METADATA = {
    "店编号": {"type": "VARCHAR", "groupable": True},
    "lead_count": {"type": "INTEGER", "groupable": False},
    "is_active": {"type": "BOOLEAN", "groupable": False},
}


def test_aggregate_query_rejects_unsafe_alias():
    with pytest.raises(QueryBuilderError):
        build_aggregate_query(
            table_name="mart_leads",
            group_by=["店编号"],
            aggregations=[
                {
                    "field": "lead_count",
                    "func": "SUM",
                    "alias": 'x"; DROP TABLE mart_leads; --',
                }
            ],
            filters=[],
            order_by=[],
            page=1,
            page_size=50,
            columns_metadata=COLUMNS_METADATA,
        )


def test_aggregate_query_rejects_unknown_order_field():
    with pytest.raises(QueryBuilderError):
        build_aggregate_query(
            table_name="mart_leads",
            group_by=["店编号"],
            aggregations=[
                {"field": "lead_count", "func": "SUM", "alias": "total_leads"}
            ],
            filters=[],
            order_by=[{"field": 'lead_count DESC; DROP TABLE mart_leads; --'}],
            page=1,
            page_size=50,
            columns_metadata=COLUMNS_METADATA,
        )


def test_aggregate_query_allows_declared_alias_ordering():
    data_sql, count_sql, params = build_aggregate_query(
        table_name="mart_leads",
        group_by=["店编号"],
        aggregations=[{"field": "lead_count", "func": "SUM", "alias": "total_leads"}],
        filters=[],
        order_by=[{"field": "total_leads", "desc": True}],
        page=1,
        page_size=50,
        columns_metadata=COLUMNS_METADATA,
    )

    assert 'SUM("lead_count") AS "total_leads"' in data_sql
    assert 'ORDER BY "total_leads" DESC' in data_sql
    assert count_sql == 'SELECT COUNT(*) as total FROM "mart_leads"'
    assert params == []


def test_detail_query_quotes_chinese_identifiers():
    data_sql, _, _ = build_detail_query(
        table_name="mart_leads",
        columns=["店编号"],
        filters=[{"field": "店编号", "operator": "=", "value": "D001"}],
        order_by=[{"field": "店编号"}],
        page=1,
        page_size=20,
        columns_metadata=COLUMNS_METADATA,
    )

    assert 'SELECT "店编号" FROM "mart_leads"' in data_sql
    assert 'WHERE "店编号" = ?' in data_sql
    assert 'ORDER BY "店编号" ASC' in data_sql
