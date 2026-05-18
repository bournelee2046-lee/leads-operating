import json
from datetime import datetime, date
from pathlib import Path
from typing import List, Dict, Any

try:
    from ..config import DATA_DIR
except ImportError:
    from config import DATA_DIR


CONFIG_TABLE_ORDER = [
    "funnel_national_visit_targets",
    "funnel_sales_targets",
    "funnel_conversion_rates",
    "funnel_model_mapping",
]

BACKUP_FILE = DATA_DIR / "funnel_config_backup.json"


class FunnelConfigBackup:

    def __init__(self, duck_db):
        self._db = duck_db
        self._backup: Dict[str, List[Dict[str, Any]]] = {}
        self._backup_file = BACKUP_FILE

    def backup(self) -> bool:
        conn = self._db.get_connection()
        has_any = False
        for table_name in CONFIG_TABLE_ORDER:
            try:
                result = conn.execute(f"SELECT * FROM {table_name}")
                columns = [desc[0] for desc in result.description]
                rows = []
                for row in result.fetchall():
                    rows.append(dict(zip(columns, row)))
                self._backup[table_name] = rows
                if rows:
                    has_any = True
            except Exception:
                self._backup[table_name] = []
        if has_any:
            self._write_file()
        return True

    def restore(self) -> bool:
        if not self.has_data():
            if not self._load_from_file():
                return False
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
        self._cleanup()

    def has_data(self) -> bool:
        return any(len(v) > 0 for v in self._backup.values())

    def _cleanup(self):
        self._backup.clear()
        if self._backup_file.exists():
            try:
                self._backup_file.unlink()
            except Exception:
                pass

    def _write_file(self):
        serializable: Dict[str, list] = {}
        for table_name, rows in self._backup.items():
            if not rows:
                continue
            serializable[table_name] = [
                {k: self._serialize(v) for k, v in row.items()}
                for row in rows
            ]
        with open(self._backup_file, "w", encoding="utf-8") as f:
            json.dump(serializable, f, ensure_ascii=False)

    def _load_from_file(self) -> bool:
        if not self._backup_file.exists():
            return False
        try:
            with open(self._backup_file, encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            return False
        for table_name in CONFIG_TABLE_ORDER:
            self._backup[table_name] = data.get(table_name, [])
        return self.has_data()

    @staticmethod
    def _serialize(val):
        if isinstance(val, (datetime, date)):
            return val.isoformat()
        return val
