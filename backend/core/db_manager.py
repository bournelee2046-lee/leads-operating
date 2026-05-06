import sqlite3
from pathlib import Path
from contextlib import contextmanager
from ..config import RAW_DB_PATH


class RawDBManager:
    """原始数据管理器 (SQLite)"""

    def __init__(self, db_path: Path = RAW_DB_PATH):
        self.db_path = db_path

    @contextmanager
    def get_connection(self):
        """
        安全的数据库连接管理器，自动处理连接关闭
        """
        conn = None
        try:
            conn = sqlite3.connect(str(self.db_path), timeout=30.0)
            conn.row_factory = sqlite3.Row
            yield conn
        finally:
            if conn:
                conn.close()

    def execute_query(self, query: str, params: tuple = ()):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            return cursor.fetchall()

    def get_date_range(self):
        """获取数据的日期范围"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT MIN(DATE(下发时间)), MAX(DATE(下发时间)) FROM 线索表"
                )
                result = cursor.fetchone()
                if result and result[0] and result[1]:
                    return (result[0], result[1])
        except Exception as e:
            print(f"Error getting date range: {e}")
        return (None, None)

    def get_dealers(self):
        """获取经销商列表"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM 门店表 ORDER BY 店编号")
            return [dict(row) for row in cursor.fetchall()]

    def get_leads_by_date(self, date_str: str):
        """获取某天的线索数据"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM 线索表 WHERE DATE(下发时间) = ?",
                (date_str,),
            )
            return [dict(row) for row in cursor.fetchall()]

    def get_latest_sync_time(self):
        """获取最新数据同步时间（最终下发时间）"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT MAX(最终下发时间) FROM 线索表")
                result = cursor.fetchone()
                if result and result[0]:
                    return result[0]
        except Exception as e:
            print(f"Error getting latest sync time: {e}")
        return None

    def get_earliest_data_time(self):
        """获取最早数据时间（最终下发时间）"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT MIN(最终下发时间) FROM 线索表")
                result = cursor.fetchone()
                if result and result[0]:
                    return result[0]
        except Exception as e:
            print(f"Error getting earliest data time: {e}")
        return None

    def get_new_leads_since(self, since_time: str):
        """获取自指定时间之后的新线索（用于增量同步）"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM 线索表 WHERE 最终下发时间 > ?",
                (since_time,),
            )
            return [dict(row) for row in cursor.fetchall()]
