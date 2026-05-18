import duckdb
from typing import List, Dict, Any


MAX_BACKUP_ROWS = 100_000

CONFIG_TABLE_ORDER = [
    "funnel_national_visit_targets",
    "funnel_sales_targets",
    "funnel_conversion_rates",
    "funnel_model_mapping",
]


class FunnelConfigBackup:
    def __init__(self, duck_db):
        self._db = duck_db
        self._backup: Dict[str, List[Dict[str, Any]]] = {}

    def backup(self) -> bool:
        conn = self._db.get_connection()
        for table_name in CONFIG_TABLE_ORDER:
            try:
                row_count = conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()[0]
                if row_count > MAX_BACKUP_ROWS:
                    raise RuntimeError(
                        f"配置表 {table_name} 有 {row_count} 行，超过安全阈值 {MAX_BACKUP_ROWS}，"
                        f"请清理数据后再执行全量刷新"
                    )
                if row_count == 0:
                    self._backup[table_name] = []
                    continue
                result = conn.execute(f"SELECT * FROM {table_name}")
                columns = [desc[0] for desc in result.description]
                rows = []
                for row in result.fetchall():
                    rows.append(dict(zip(columns, row)))
                self._backup[table_name] = rows
            except RuntimeError:
                raise
            except Exception:
                self._backup[table_name] = []
        return True

    def restore(self) -> bool:
        conn = self._db.get_connection()
        for table_name in CONFIG_TABLE_ORDER:
            rows = self._backup.get(table_name, [])
            if not rows:
                continue
            columns = list(rows[0].keys())
            col_list = ", ".join(columns)
            placeholders = ", ".join(["?"] * len(columns))
            sql = f"INSERT OR REPLACE INTO {table_name} ({col_list}) VALUES ({placeholders})"
            tuples = [tuple(row[col] for col in columns) for row in rows]
            conn.executemany(sql, tuples)
        conn.commit()
        self._backup.clear()
        return True

    def discard(self):
        self._backup.clear()

    def has_data(self) -> bool:
        return any(len(v) > 0 for v in self._backup.values())
