import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

# 原始数据路径
RAW_DB_PATH = BASE_DIR.parent / "leads.db"

# DuckDB 数据路径 - 单一数据库
DUCKDB_PATH = DATA_DIR / "leads_analytics.db"

# 创建数据目录
DATA_DIR.mkdir(exist_ok=True)

# Flask 配置
class Config:
    DEBUG = True
    SECRET_KEY = "dev-secret-key-change-in-production"
    CORS_HEADERS = "Content-Type"

    @staticmethod
    def init_app(app):
        pass
