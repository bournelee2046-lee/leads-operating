import argparse
import shutil
import sqlite3
from pathlib import Path

from backend.config import AUTH_DB_PATH, RAW_DB_PATH


AUTH_TABLES = [
    "sys_users",
    "sys_roles",
    "sys_user_roles",
    "sys_permissions",
    "sys_role_permissions",
    "sys_organizations",
    "sys_role_data_scopes",
    "sys_login_logs",
    "sys_audit_logs",
]


def table_exists(conn, table_name):
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def copy_table(source_conn, target_conn, table_name, overwrite=False):
    if not table_exists(source_conn, table_name):
        return {"table": table_name, "status": "missing", "rows": 0}

    if table_exists(target_conn, table_name):
        if not overwrite:
            count = target_conn.execute(f'SELECT COUNT(*) FROM "{table_name}"').fetchone()[0]
            return {"table": table_name, "status": "exists_skipped", "rows": count}
        target_conn.execute(f'DROP TABLE "{table_name}"')

    create_sql = source_conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()[0]
    target_conn.execute(create_sql)

    rows = source_conn.execute(f'SELECT * FROM "{table_name}"').fetchall()
    if rows:
        columns = [description[0] for description in source_conn.execute(f'SELECT * FROM "{table_name}" LIMIT 1').description]
        placeholders = ",".join(["?"] * len(columns))
        column_sql = ",".join([f'"{column}"' for column in columns])
        target_conn.executemany(
            f'INSERT INTO "{table_name}" ({column_sql}) VALUES ({placeholders})',
            [tuple(row) for row in rows],
        )
    return {"table": table_name, "status": "copied", "rows": len(rows)}


def migrate(source_path, target_path, overwrite=False, backup=True):
    source_path = Path(source_path)
    target_path = Path(target_path)

    if not source_path.exists():
        raise FileNotFoundError(f"源业务库不存在：{source_path}")

    target_path.parent.mkdir(parents=True, exist_ok=True)
    if target_path.exists() and backup:
        backup_path = target_path.with_suffix(target_path.suffix + ".bak")
        shutil.copy2(target_path, backup_path)
        print(f"已备份目标权限库：{backup_path}")

    with sqlite3.connect(source_path) as source_conn, sqlite3.connect(target_path) as target_conn:
        source_conn.row_factory = sqlite3.Row
        target_conn.row_factory = sqlite3.Row
        results = []
        for table_name in AUTH_TABLES:
            results.append(copy_table(source_conn, target_conn, table_name, overwrite=overwrite))
        target_conn.commit()
    return results


def main():
    parser = argparse.ArgumentParser(description="将 leads.db 中的 sys_* 权限表迁移到项目 data/leads_auth.db 权限库")
    parser.add_argument("--source", default=str(RAW_DB_PATH), help="源业务库路径，默认 LEADS_RAW_DB_PATH 或 ../leads.db")
    parser.add_argument("--target", default=str(AUTH_DB_PATH), help="目标权限库路径，默认 LEADS_AUTH_DB_PATH 或 data/leads_auth.db")
    parser.add_argument("--overwrite", action="store_true", help="目标表已存在时覆盖")
    parser.add_argument("--no-backup", action="store_true", help="覆盖前不备份目标库")
    args = parser.parse_args()

    results = migrate(args.source, args.target, overwrite=args.overwrite, backup=not args.no_backup)
    for result in results:
        print(f"{result['table']}: {result['status']} ({result['rows']} rows)")
    print("迁移完成。旧业务库中的 sys_* 表不会自动删除，请确认后再人工清理。")


if __name__ == "__main__":
    main()
