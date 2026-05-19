"""
通用查询构建器
负责安全地构建 SQL 查询语句，防止 SQL 注入
"""

from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime
import re


ALLOWED_OPERATORS = {
    "=", "!=", ">", ">=", "<", "<=",
    "LIKE", "NOT LIKE",
    "IN", "NOT IN",
    "BETWEEN", "NOT BETWEEN",
    "IS NULL", "IS NOT NULL",
}

AGGREGATION_FUNCTIONS = ["COUNT", "SUM", "AVG", "MIN", "MAX"]

SORT_DIRECTIONS = ["ASC", "DESC"]

MAX_PAGE_SIZE = 500
DEFAULT_PAGE_SIZE = 50
MAX_QUERY_ROWS = 10000
MAX_IDENTIFIER_LENGTH = 128
SAFE_ALIAS_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,63}$")


class QueryBuilderError(Exception):
    """查询构建器错误"""
    pass


def quote_identifier(identifier: str) -> str:
    """Quote a SQL identifier after minimal validation."""
    if not isinstance(identifier, str):
        raise QueryBuilderError("Invalid identifier")

    identifier = identifier.strip()
    if not identifier or len(identifier) > MAX_IDENTIFIER_LENGTH or "\x00" in identifier:
        raise QueryBuilderError("Invalid identifier")

    escaped = identifier.replace('"', '""')
    return f'"{escaped}"'


def validate_alias(alias: str) -> str:
    """Validate user-supplied aggregate aliases."""
    if not isinstance(alias, str) or not SAFE_ALIAS_PATTERN.match(alias):
        raise QueryBuilderError(f"Invalid aggregation alias: {alias}")
    return alias


def default_aggregate_alias(func: str, field: str, index: int) -> str:
    alias = func.lower() if field == "*" else f"{func.lower()}_{field}"
    if SAFE_ALIAS_PATTERN.match(alias):
        return alias
    return f"{func.lower()}_{index + 1}"


class SafeQueryBuilder:
    """安全查询构建器"""

    def __init__(self, table_name: str, columns_metadata: Dict):
        self.table_name = table_name
        self.columns_metadata = columns_metadata
        self._filters: List[Dict] = []
        self._group_by: List[str] = []
        self._aggregations: List[Dict] = []
        self._order_by: List[Dict] = []
        self._columns: List[str] = []
        self._page: int = 1
        self._page_size: int = DEFAULT_PAGE_SIZE
        self._is_aggregate: bool = False

    def select(self, columns: List[str]) -> 'SafeQueryBuilder':
        """选择查询字段"""
        valid_columns = []
        for col in columns:
            if col in self.columns_metadata:
                valid_columns.append(col)
            elif col == "*":
                valid_columns = list(self.columns_metadata.keys())
                break
        self._columns = valid_columns if valid_columns else list(self.columns_metadata.keys())
        return self

    def filter(self, field: str, operator: str, value: Any = None, value2: Any = None) -> 'SafeQueryBuilder':
        """添加过滤条件"""
        if field not in self.columns_metadata:
            raise QueryBuilderError(f"Invalid field: {field}")

        operator = operator.upper()
        if operator not in ALLOWED_OPERATORS:
            raise QueryBuilderError(f"Invalid operator: {operator}")

        self._filters.append({
            "field": field,
            "operator": operator,
            "value": value,
            "value2": value2,
        })
        return self

    def group_by(self, fields: List[str]) -> 'SafeQueryBuilder':
        """设置分组字段"""
        valid_fields = []
        for field in fields:
            if field in self.columns_metadata:
                col_meta = self.columns_metadata[field]
                if col_meta.get("groupable", True):
                    valid_fields.append(field)
        self._group_by = valid_fields
        if valid_fields:
            self._is_aggregate = True
        return self

    def aggregate(self, field: str, func: str, alias: str = None) -> 'SafeQueryBuilder':
        """添加聚合函数"""
        func = func.upper()
        if func not in AGGREGATION_FUNCTIONS:
            raise QueryBuilderError(f"Invalid aggregation function: {func}")

        if field != "*" and field not in self.columns_metadata:
            raise QueryBuilderError(f"Invalid field for aggregation: {field}")

        alias = validate_alias(alias or default_aggregate_alias(func, field, len(self._aggregations)))

        self._aggregations.append({
            "field": field,
            "func": func,
            "alias": alias,
        })
        self._is_aggregate = True
        return self

    def order_by(self, field: str, desc: bool = False) -> 'SafeQueryBuilder':
        """设置排序"""
        allowed_fields = set(self.columns_metadata.keys())
        if self._is_aggregate:
            allowed_fields.update(agg["alias"] for agg in self._aggregations)

        if field not in allowed_fields:
            raise QueryBuilderError(f"Invalid order field: {field}")

        direction = "DESC" if desc else "ASC"
        self._order_by.append({"field": field, "direction": direction})
        return self

    def paginate(self, page: int = 1, page_size: int = DEFAULT_PAGE_SIZE) -> 'SafeQueryBuilder':
        """设置分页"""
        self._page = max(1, page)
        self._page_size = min(max(1, page_size), MAX_PAGE_SIZE)
        return self

    def build_detail_query(self) -> Tuple[str, List[Any]]:
        """构建明细查询SQL（非聚合）"""
        if self._is_aggregate:
            raise QueryBuilderError("Cannot build detail query with aggregation settings")

        columns_str = ", ".join([quote_identifier(col) for col in self._columns]) if self._columns else "*"

        sql = f"SELECT {columns_str} FROM {quote_identifier(self.table_name)}"

        params = []
        where_parts = []

        for f in self._filters:
            part, p = self._build_filter_part(f)
            where_parts.append(part)
            params.extend(p)

        if where_parts:
            sql += " WHERE " + " AND ".join(where_parts)

        if self._order_by:
            order_parts = [f'{quote_identifier(o["field"])} {o["direction"]}' for o in self._order_by]
            sql += " ORDER BY " + ", ".join(order_parts)

        offset = (self._page - 1) * self._page_size
        sql += f" LIMIT {self._page_size} OFFSET {offset}"

        return sql, params

    def build_aggregate_query(self) -> Tuple[str, List[Any]]:
        """构建聚合查询SQL"""
        if not self._is_aggregate and not self._aggregations:
            raise QueryBuilderError("No aggregation specified")

        select_parts = []

        if self._group_by:
            for field in self._group_by:
                select_parts.append(quote_identifier(field))

        for agg in self._aggregations:
            if agg["field"] == "*":
                field_str = "*"
            else:
                col_meta = self.columns_metadata.get(agg["field"], {})
                col_type = col_meta.get("type", "").upper()
                field_str = quote_identifier(agg["field"])
                if agg["func"] in ("SUM", "AVG") and "BOOL" in col_type:
                    field_str = f"CAST({quote_identifier(agg['field'])} AS INTEGER)"
            select_parts.append(f'{agg["func"]}({field_str}) AS {quote_identifier(agg["alias"])}')

        if not select_parts:
            select_parts = ["COUNT(*) AS \"count\""]

        sql = f"SELECT {', '.join(select_parts)} FROM {quote_identifier(self.table_name)}"

        params = []
        where_parts = []

        for f in self._filters:
            part, p = self._build_filter_part(f)
            where_parts.append(part)
            params.extend(p)

        if where_parts:
            sql += " WHERE " + " AND ".join(where_parts)

        if self._group_by:
            group_fields = [quote_identifier(f) for f in self._group_by]
            sql += " GROUP BY " + ", ".join(group_fields)

        if self._order_by:
            order_parts = []
            for o in self._order_by:
                field = o["field"]
                order_parts.append(f'{quote_identifier(field)} {o["direction"]}')
            sql += " ORDER BY " + ", ".join(order_parts)

        offset = (self._page - 1) * self._page_size
        sql += f" LIMIT {self._page_size} OFFSET {offset}"

        return sql, params

    def build_count_query(self) -> Tuple[str, List[Any]]:
        """构建计数查询（用于分页总数）"""
        sql = f"SELECT COUNT(*) as total FROM {quote_identifier(self.table_name)}"

        params = []
        where_parts = []

        for f in self._filters:
            part, p = self._build_filter_part(f)
            where_parts.append(part)
            params.extend(p)

        if where_parts:
            sql += " WHERE " + " AND ".join(where_parts)

        return sql, params

    def _build_filter_part(self, filter_def: Dict) -> Tuple[str, List[Any]]:
        """构建单个过滤条件的 SQL 片段"""
        field = filter_def["field"]
        operator = filter_def["operator"]
        value = filter_def["value"]
        value2 = filter_def.get("value2")

        field_str = quote_identifier(field)

        if operator in ("IS NULL", "IS NOT NULL"):
            return f"{field_str} {operator}", []

        if operator == "IN":
            if not isinstance(value, list):
                raise QueryBuilderError("IN operator requires a list value")
            if not value:
                return "1=0", []
            placeholders = ", ".join(["?"] * len(value))
            return f"{field_str} IN ({placeholders})", value

        if operator == "NOT IN":
            if not isinstance(value, list):
                raise QueryBuilderError("NOT IN operator requires a list value")
            if not value:
                return "1=1", []
            placeholders = ", ".join(["?"] * len(value))
            return f"{field_str} NOT IN ({placeholders})", value

        if operator == "BETWEEN":
            if value is None or value2 is None:
                raise QueryBuilderError("BETWEEN operator requires two values")
            return f"{field_str} BETWEEN ? AND ?", [value, value2]

        if operator == "NOT BETWEEN":
            if value is None or value2 is None:
                raise QueryBuilderError("NOT BETWEEN operator requires two values")
            return f"{field_str} NOT BETWEEN ? AND ?", [value, value2]

        if operator == "LIKE":
            return f"{field_str} LIKE ?", [value]

        if operator == "NOT LIKE":
            return f"{field_str} NOT LIKE ?", [value]

        return f"{field_str} {operator} ?", [value]


def build_detail_query(table_name: str, columns: List[str], filters: List[Dict],
                       order_by: List[Dict], page: int, page_size: int,
                       columns_metadata: Dict) -> Tuple[str, str, List[Any]]:
    """构建明细查询SQL（便捷函数）"""
    builder = SafeQueryBuilder(table_name, columns_metadata)

    builder.select(columns)

    for f in filters:
        builder.filter(
            field=f["field"],
            operator=f["operator"],
            value=f.get("value"),
            value2=f.get("value2")
        )

    for o in order_by:
        builder.order_by(field=o["field"], desc=o.get("desc", False))

    builder.paginate(page=page, page_size=page_size)

    data_sql, params = builder.build_detail_query()
    count_sql, count_params = builder.build_count_query()

    return data_sql, count_sql, params


def build_aggregate_query(table_name: str, group_by: List[str], aggregations: List[Dict],
                          filters: List[Dict], order_by: List[Dict], page: int, page_size: int,
                          columns_metadata: Dict) -> Tuple[str, str, List[Any]]:
    """构建聚合查询SQL（便捷函数）"""
    builder = SafeQueryBuilder(table_name, columns_metadata)

    if group_by:
        builder.group_by(group_by)

    for agg in aggregations:
        builder.aggregate(
            field=agg["field"],
            func=agg["func"],
            alias=agg.get("alias")
        )

    for f in filters:
        builder.filter(
            field=f["field"],
            operator=f["operator"],
            value=f.get("value"),
            value2=f.get("value2")
        )

    for o in order_by:
        builder.order_by(field=o["field"], desc=o.get("desc", False))

    builder.paginate(page=page, page_size=page_size)

    data_sql, params = builder.build_aggregate_query()
    count_sql, count_params = builder.build_count_query()

    return data_sql, count_sql, params
