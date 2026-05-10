"""
查询元数据管理系统
负责管理可查询表的元数据信息，支持自动发现和手动配置
"""

import duckdb
from typing import Dict, List, Optional
from dataclasses import dataclass, field, asdict
from ..config import DUCKDB_PATH


@dataclass
class ColumnMetadata:
    """字段元数据"""
    name: str
    type: str
    display_name: str
    is_primary_key: bool = False
    is_foreign_key: bool = False
    references: Optional[str] = None
    searchable: bool = True
    filterable: bool = True
    groupable: bool = True
    aggregatable: bool = False
    sensitive: bool = False
    description: str = ""


@dataclass
class TableMetadata:
    """表元数据"""
    name: str
    display_name: str
    category: str
    queryable: bool = True
    description: str = ""
    columns: Dict[str, ColumnMetadata] = field(default_factory=dict)


TABLE_DISPLAY_NAMES = {
    "mart_leads": "线索表",
    "mart_dealers": "门店表",
    "mart_customer_visit": "客流跟进表",
    "metric_daily": "日度指标表",
    "metric_dealer_ranking": "门店排名表",
    "metric_channels": "渠道统计表",
    "fact_daily_visit": "客流事实表",
    "dim_dates": "日期维度表",
}

COLUMN_DISPLAY_NAMES = {
    "mart_leads": {
        "lead_id": "线索ID",
        "phone": "手机号",
        "dealer_id": "门店编号",
        "dealer_name": "门店名称",
        "region": "大区",
        "province": "省份",
        "city": "城市",
        "channel_1": "一级渠道",
        "channel_2": "二级渠道",
        "channel_3": "三级渠道",
        "channel_4": "四级渠道",
        "assign_date": "下发日期",
        "assign_time": "下发时间",
        "first_follow_date": "首跟日期",
        "first_follow_time": "首跟时间",
        "is_followed_in_30min": "是否30分钟内跟进",
        "follow_count": "总跟进次数",
        "lead_status": "线索状态",
        "is_converted": "是否转化",
        "conversion_date": "转化日期",
        "conversion_model": "转化车型",
        "days_to_convert": "转化天数",
        "is_to_shop": "是否到店",
        "is_test_drive": "是否试驾",
        "is_ordered": "是否下订",
    },
    "mart_dealers": {
        "dealer_id": "门店编号",
        "dealer_name": "门店名称",
        "region": "大区",
        "zone": "战区",
        "region_manager": "大区经理",
        "zone_manager": "战区经理",
        "is_key_store": "是否重点店",
        "key_store_type": "重点店类型",
        "province": "省份",
    },
    "mart_customer_visit": {
        "lead_id": "线索ID",
        "dealer_id": "门店编号",
        "visit_time": "进店时间",
        "follower_id": "跟进人ID",
        "follower_role": "跟进人角色",
        "followup_created_time": "跟进创建日期",
        "channel_1": "一级渠道",
        "channel_2": "二级渠道",
        "channel_3": "三级渠道",
        "channel_4": "四级渠道",
        "assign_time": "下发时间",
        "follower_name": "顾问姓名",
        "follower_position": "顾问岗位",
    },
    "metric_daily": {
        "date_id": "日期",
        "dealer_id": "门店编号",
        "channel_1": "一级渠道",
        "region": "大区",
        "lead_count": "线索数",
        "follow_in_30min_count": "30分钟跟进数",
        "follow_in_30min_rate": "30分钟跟进率",
        "to_shop_count": "到店数",
        "to_shop_rate": "到店率",
        "test_drive_count": "试驾数",
        "test_drive_rate": "试驾率",
        "order_count": "下订数",
        "conversion_count": "转化数",
        "conversion_rate": "转化率",
        "avg_days_to_convert": "平均转化天数",
        "avg_follow_count": "平均跟进次数",
    },
    "metric_dealer_ranking": {
        "period_type": "周期类型",
        "period_date": "统计日期",
        "dealer_id": "门店编号",
        "dealer_name": "门店名称",
        "region": "大区",
        "rank_in_region": "区域排名",
        "rank_all": "总排名",
        "lead_count": "线索数",
        "conversion_count": "转化数",
        "conversion_rate": "转化率",
    },
    "metric_channels": {
        "date_id": "日期",
        "period_type": "周期类型",
        "channel_1": "一级渠道",
        "channel_2": "二级渠道",
        "lead_count": "线索数",
        "lead_percentage": "线索占比",
        "conversion_count": "转化数",
        "conversion_rate": "转化率",
        "avg_days_to_convert": "平均转化天数",
    },
    "fact_daily_visit": {
        "visit_date": "进店日期",
        "period_type": "周期类型",
        "dealer_id": "门店编号",
        "dealer_name": "门店名称",
        "region": "大区",
        "zone": "战区",
        "province": "省份",
        "channel_1": "一级渠道",
        "channel_2": "二级渠道",
        "visit_count": "进店次数",
        "unique_lead_count": "唯一线索数",
        "unique_consultant_count": "唯一顾问数",
    },
}

SENSITIVE_COLUMNS = {
    "mart_leads": ["phone"],
}

PRIMARY_KEYS = {
    "mart_leads": "lead_id",
    "mart_dealers": "dealer_id",
    "mart_customer_visit": None,
    "metric_daily": None,
    "metric_dealer_ranking": None,
    "metric_channels": None,
    "fact_daily_visit": None,
    "dim_dates": "date_id",
}

TABLE_CATEGORIES = {
    "mart_leads": "业务数据",
    "mart_dealers": "维度数据",
    "mart_customer_visit": "业务数据",
    "metric_daily": "指标数据",
    "metric_dealer_ranking": "指标数据",
    "metric_channels": "指标数据",
    "fact_daily_visit": "事实数据",
    "dim_dates": "维度数据",
}


class QueryMetadataRegistry:
    """查询元数据注册中心"""

    def __init__(self):
        self.tables: Dict[str, TableMetadata] = {}
        self._initialized = False

    def initialize(self, db_path: str = None):
        """初始化元数据（自动从 DuckDB 发现表结构）"""
        if self._initialized:
            return

        db_path = db_path or str(DUCKDB_PATH)

        try:
            conn = duckdb.connect(db_path)

            tables_result = conn.execute("SHOW TABLES").fetchall()
            table_names = [t[0] for t in tables_result]

            for table_name in table_names:
                if not self._is_queryable_table(table_name):
                    continue

                self._discover_table(conn, table_name)

            conn.close()
            self._initialized = True

        except Exception as e:
            print(f"Warning: Failed to auto-discover tables: {e}")

    def _is_queryable_table(self, table_name: str) -> bool:
        """判断表是否可查询"""
        allowed_prefixes = ["mart_", "metric_", "fact_", "dim_"]
        return any(table_name.startswith(prefix) for prefix in allowed_prefixes)

    def _discover_table(self, conn, table_name: str):
        """自动发现表结构"""
        try:
            columns_result = conn.execute(f"DESCRIBE {table_name}").fetchall()

            table_meta = TableMetadata(
                name=table_name,
                display_name=TABLE_DISPLAY_NAMES.get(table_name, table_name),
                category=TABLE_CATEGORIES.get(table_name, "其他"),
                queryable=True,
            )

            pk_column = PRIMARY_KEYS.get(table_name)
            sensitive_cols = SENSITIVE_COLUMNS.get(table_name, [])
            col_display_names = COLUMN_DISPLAY_NAMES.get(table_name, {})

            for col_row in columns_result:
                col_name = col_row[0]
                col_type = col_row[1]

                col_meta = ColumnMetadata(
                    name=col_name,
                    type=col_type,
                    display_name=col_display_names.get(col_name, col_name),
                    is_primary_key=(col_name == pk_column),
                    sensitive=(col_name in sensitive_cols),
                )

                if col_name in ["created_at", "updated_at"]:
                    col_meta.filterable = False
                    col_meta.groupable = False

                table_meta.columns[col_name] = col_meta

            self.tables[table_name] = table_meta

        except Exception as e:
            print(f"Warning: Failed to discover table {table_name}: {e}")

    def get_all_tables(self, category: str = None) -> List[Dict]:
        """获取所有可查询表列表"""
        tables = []
        for table_name, table_meta in self.tables.items():
            if category and table_meta.category != category:
                continue
            tables.append({
                "name": table_meta.name,
                "display_name": table_meta.display_name,
                "category": table_meta.category,
                "description": table_meta.description,
                "column_count": len(table_meta.columns),
            })
        return tables

    def get_table_schema(self, table_name: str) -> Optional[Dict]:
        """获取表字段元数据"""
        table_meta = self.tables.get(table_name)
        if not table_meta:
            return None

        columns = []
        for col_name, col_meta in table_meta.columns.items():
            columns.append({
                "name": col_meta.name,
                "type": col_meta.type,
                "display_name": col_meta.display_name,
                "is_primary_key": col_meta.is_primary_key,
                "is_foreign_key": col_meta.is_foreign_key,
                "searchable": col_meta.searchable,
                "filterable": col_meta.filterable,
                "groupable": col_meta.groupable,
                "aggregatable": col_meta.aggregatable,
                "sensitive": col_meta.sensitive,
                "description": col_meta.description,
            })

        return {
            "name": table_meta.name,
            "display_name": table_meta.display_name,
            "category": table_meta.category,
            "description": table_meta.description,
            "columns": columns,
        }

    def get_primary_key(self, table_name: str) -> Optional[str]:
        """获取表主键"""
        for col_name, col_meta in self.tables.get(table_name, TableMetadata("", "", "")).columns.items():
            if col_meta.is_primary_key:
                return col_name
        return None

    def validate_table(self, table_name: str) -> bool:
        """验证表是否可查询"""
        return table_name in self.tables and self.tables[table_name].queryable

    def validate_columns(self, table_name: str, columns: List[str]) -> List[str]:
        """验证字段是否合法，返回合法字段列表"""
        if table_name not in self.tables:
            return []

        valid_columns = []
        table_meta = self.tables[table_name]

        for col in columns:
            if col in table_meta.columns:
                valid_columns.append(col)

        return valid_columns

    def get_filterable_columns(self, table_name: str) -> List[Dict]:
        """获取可过滤的字段列表"""
        if table_name not in self.tables:
            return []

        return [
            {
                "name": col_meta.name,
                "type": col_meta.type,
                "display_name": col_meta.display_name,
            }
            for col_meta in self.tables[table_name].columns.values()
            if col_meta.filterable
        ]

    def get_groupable_columns(self, table_name: str) -> List[Dict]:
        """获取可分组的字段列表"""
        if table_name not in self.tables:
            return []

        return [
            {
                "name": col_meta.name,
                "type": col_meta.type,
                "display_name": col_meta.display_name,
            }
            for col_meta in self.tables[table_name].columns.values()
            if col_meta.groupable
        ]

    def get_aggregatable_columns(self, table_name: str) -> List[Dict]:
        """获取可聚合的字段列表（数值型）"""
        if table_name not in self.tables:
            return []

        numeric_types = ["INTEGER", "BIGINT", "DOUBLE", "FLOAT", "DECIMAL", "NUMERIC", "INT", "HUGEINT", "UTINYINT", "USMALLINT", "UINTEGER", "UBIGINT", "UHUGEINT"]

        return [
            {
                "name": col_meta.name,
                "type": col_meta.type,
                "display_name": col_meta.display_name,
            }
            for col_meta in self.tables[table_name].columns.values()
            if any(t in col_meta.type.upper() for t in numeric_types)
        ]


metadata_registry = QueryMetadataRegistry()
