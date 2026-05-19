import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"

# 原始业务数据路径
RAW_DB_PATH = Path(os.getenv("LEADS_RAW_DB_PATH", BASE_DIR.parent / "leads.db"))

# 账号权限数据路径
# 默认放在项目 data 目录内，便于本地启动和云服务器部署时随项目目录统一管理。
AUTH_DB_PATH = Path(os.getenv("LEADS_AUTH_DB_PATH", DATA_DIR / "leads_auth.db"))

# DuckDB 数据路径 - 单一数据库
DUCKDB_PATH = Path(os.getenv("LEADS_DUCKDB_PATH", DATA_DIR / "leads_analytics.db"))

# 创建数据目录
DATA_DIR.mkdir(exist_ok=True)


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() == "true"


# Flask 配置
class Config:
    FLASK_ENV = os.getenv("FLASK_ENV", "development")
    IS_PRODUCTION = FLASK_ENV == "production"
    DEBUG = _env_bool("FLASK_DEBUG", not IS_PRODUCTION)
    SECRET_KEY = os.getenv("LEADS_SECRET_KEY", "dev-secret-key-change-in-production")
    CORS_ORIGINS = [
        origin.strip()
        for origin in os.getenv("LEADS_CORS_ORIGINS", "" if IS_PRODUCTION else "*").split(",")
        if origin.strip()
    ]
    CORS_HEADERS = "Content-Type"
    PERMANENT_SESSION_LIFETIME = int(os.getenv("LEADS_SESSION_LIFETIME_SECONDS", "28800"))
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = os.getenv("LEADS_SESSION_COOKIE_SAMESITE", "Lax")
    SESSION_COOKIE_SECURE = _env_bool("LEADS_SESSION_COOKIE_SECURE", IS_PRODUCTION)

    @staticmethod
    def init_app(app):
        if Config.FLASK_ENV == "production" and Config.SECRET_KEY == "dev-secret-key-change-in-production":
            raise RuntimeError("生产环境必须设置 LEADS_SECRET_KEY，不能使用开发默认密钥")
