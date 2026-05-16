import json
import os
import secrets
import string
from datetime import datetime
from functools import wraps

from flask import g, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from backend.auth.permissions import OPERATIONS_EXTRA_API_PERMISSIONS, PERMISSIONS


DEFAULT_ADMIN_USERNAME = os.getenv("LEADS_DEFAULT_ADMIN_USERNAME", "admin")
DEFAULT_ADMIN_PASSWORD = os.getenv("LEADS_DEFAULT_ADMIN_PASSWORD", "Admin@123456")

PUBLIC_API_RULES = {
    ("GET", "/api/health"),
    ("POST", "/api/auth/login"),
}

AUDIT_API_ACTIONS = {
    ("POST", "/api/refresh/trigger"): ("首页", "同步新数据", "refresh"),
    ("GET", "/api/follow-up/distribution"): ("跟进次数分布", "查询", "follow_distribution"),
    ("GET", "/api/customer_visit/stats"): ("客流明细", "查看统计", "customer_visit"),
    ("GET", "/api/customer_visit/detail"): ("客流明细", "查询", "customer_visit"),
    ("GET", "/api/customer_visit/export"): ("客流明细", "导出", "customer_visit"),
    ("GET", "/api/visit_stats"): ("客流统计", "查询", "visit_stats"),
    ("GET", "/api/visit_stats/export"): ("客流统计", "导出", "visit_stats"),
    ("GET", "/api/query/tables"): ("数据查询", "查看可查询表", "data_query"),
    ("GET", "/api/query/table/<table_name>/schema"): ("数据查询", "查看表结构", "data_query"),
    ("POST", "/api/query/detail"): ("数据查询", "执行明细查询", "data_query"),
    ("POST", "/api/query/aggregate"): ("数据查询", "执行聚合查询", "data_query"),
    ("POST", "/api/query/export"): ("数据查询", "导出查询结果", "data_query"),
    ("GET", "/api/query/filterable/<table_name>"): ("数据查询", "查看筛选字段", "data_query"),
    ("GET", "/api/query/groupable/<table_name>"): ("数据查询", "查看分组字段", "data_query"),
    ("GET", "/api/query/aggregatable/<table_name>"): ("数据查询", "查看聚合字段", "data_query"),
    ("GET", "/api/dealer-daily-report"): ("运营日报", "查询", "dealer_daily_report"),
    ("GET", "/api/dealer-daily-report/export"): ("运营日报", "导出", "dealer_daily_report"),
    ("GET", "/api/dealer-daily-report/export-template"): ("运营日报", "导出日报模板", "dealer_daily_report"),
    ("GET", "/api/dealer-daily-report/export-custom-range"): ("运营日报", "导出自定义周期日报", "dealer_daily_report"),
}


def now_str():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def row_to_dict(row):
    return dict(row) if row else None


def get_client_ip():
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.remote_addr or ""


def flatten_permissions():
    items = []
    for sort_order, parent in enumerate(PERMISSIONS, start=1):
        items.append(
            {
                "code": parent["code"],
                "name": parent["name"],
                "type": parent["type"],
                "parent_code": None,
                "route": parent.get("route"),
                "api_method": None,
                "api_path": None,
                "sort_order": sort_order * 100,
            }
        )
        for child_order, child in enumerate(parent.get("children", []), start=1):
            code, name, resource_type, route, api_method, api_path = child
            items.append(
                {
                    "code": code,
                    "name": name,
                    "type": resource_type,
                    "parent_code": parent["code"],
                    "route": route,
                    "api_method": api_method,
                    "api_path": api_path,
                    "sort_order": sort_order * 100 + child_order,
                }
            )
    return items


def initialize_auth_system(raw_db):
    with raw_db.get_connection() as conn:
        create_tables(conn)
        seed_permissions(conn)
        seed_roles(conn)
        seed_default_admin(conn)
        conn.commit()


def create_tables(conn):
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS sys_users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            display_name TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            org_id INTEGER,
            status TEXT NOT NULL DEFAULT 'active',
            last_login_at TEXT,
            last_login_ip TEXT,
            created_by INTEGER,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sys_roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role_code TEXT NOT NULL UNIQUE,
            role_name TEXT NOT NULL,
            description TEXT,
            is_builtin INTEGER NOT NULL DEFAULT 0,
            data_scope_type TEXT NOT NULL DEFAULT 'all',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sys_user_roles (
            user_id INTEGER NOT NULL,
            role_id INTEGER NOT NULL,
            PRIMARY KEY (user_id, role_id)
        );

        CREATE TABLE IF NOT EXISTS sys_permissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            permission_code TEXT NOT NULL UNIQUE,
            permission_name TEXT NOT NULL,
            resource_type TEXT NOT NULL,
            parent_id INTEGER,
            route_path TEXT,
            api_method TEXT,
            api_path TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_enabled INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS sys_role_permissions (
            role_id INTEGER NOT NULL,
            permission_id INTEGER NOT NULL,
            PRIMARY KEY (role_id, permission_id)
        );

        CREATE TABLE IF NOT EXISTS sys_organizations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            org_code TEXT NOT NULL UNIQUE,
            org_name TEXT NOT NULL,
            org_type TEXT NOT NULL,
            parent_id INTEGER,
            dealer_id TEXT,
            is_enabled INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS sys_role_data_scopes (
            role_id INTEGER NOT NULL,
            scope_type TEXT NOT NULL DEFAULT 'all',
            scope_value TEXT
        );

        CREATE TABLE IF NOT EXISTS sys_login_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            user_id INTEGER,
            login_at TEXT NOT NULL,
            login_ip TEXT,
            result TEXT NOT NULL,
            failure_reason TEXT,
            user_agent TEXT
        );

        CREATE TABLE IF NOT EXISTS sys_audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            operator_id INTEGER,
            operator_name TEXT,
            module TEXT,
            action TEXT,
            target_type TEXT,
            target_id TEXT,
            before_data TEXT,
            after_data TEXT,
            result TEXT NOT NULL,
            error_message TEXT,
            ip_address TEXT,
            created_at TEXT NOT NULL
        );
        """
    )


def seed_permissions(conn):
    cursor = conn.cursor()
    parent_ids = {}
    for item in flatten_permissions():
        parent_id = parent_ids.get(item["parent_code"])
        cursor.execute(
            """
            INSERT INTO sys_permissions (
                permission_code, permission_name, resource_type, parent_id,
                route_path, api_method, api_path, sort_order, is_enabled
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(permission_code) DO UPDATE SET
                permission_name = excluded.permission_name,
                resource_type = excluded.resource_type,
                parent_id = excluded.parent_id,
                route_path = excluded.route_path,
                api_method = excluded.api_method,
                api_path = excluded.api_path,
                sort_order = excluded.sort_order,
                is_enabled = 1
            """,
            (
                item["code"],
                item["name"],
                item["type"],
                parent_id,
                item["route"],
                item["api_method"],
                item["api_path"],
                item["sort_order"],
            ),
        )
        cursor.execute(
            "SELECT id FROM sys_permissions WHERE permission_code = ?",
            (item["code"],),
        )
        parent_ids[item["code"]] = cursor.fetchone()["id"]


def seed_roles(conn):
    current = now_str()
    roles = [
        ("hq_admin", "总部管理员", "系统管理员和业务负责人", 1, "all"),
        ("hq_operator", "总部运营人员", "总部运营人员和数据分析人员", 1, "all"),
    ]
    for role in roles:
        conn.execute(
            """
            INSERT INTO sys_roles (role_code, role_name, description, is_builtin, data_scope_type, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(role_code) DO UPDATE SET
                role_name = excluded.role_name,
                description = excluded.description,
                is_builtin = excluded.is_builtin,
                data_scope_type = excluded.data_scope_type,
                updated_at = excluded.updated_at
            """,
            (*role, current, current),
        )

    admin_role = conn.execute("SELECT id FROM sys_roles WHERE role_code = 'hq_admin'").fetchone()
    operator_role = conn.execute("SELECT id FROM sys_roles WHERE role_code = 'hq_operator'").fetchone()
    all_permissions = conn.execute("SELECT id, permission_code FROM sys_permissions WHERE is_enabled = 1").fetchall()

    conn.execute("DELETE FROM sys_role_permissions WHERE role_id = ?", (admin_role["id"],))
    conn.executemany(
        "INSERT OR IGNORE INTO sys_role_permissions (role_id, permission_id) VALUES (?, ?)",
        [(admin_role["id"], row["id"]) for row in all_permissions],
    )

    operator_permission_ids = [
        row["id"]
        for row in all_permissions
        if not row["permission_code"].startswith("admin.")
        and row["permission_code"] != "admin.module"
    ]
    existing_operator_permissions = conn.execute(
        "SELECT COUNT(*) FROM sys_role_permissions WHERE role_id = ?",
        (operator_role["id"],),
    ).fetchone()[0]
    if existing_operator_permissions == 0:
        conn.executemany(
            "INSERT OR IGNORE INTO sys_role_permissions (role_id, permission_id) VALUES (?, ?)",
            [(operator_role["id"], permission_id) for permission_id in operator_permission_ids],
        )

    for role_id in (admin_role["id"], operator_role["id"]):
        conn.execute(
            "INSERT OR IGNORE INTO sys_role_data_scopes (role_id, scope_type, scope_value) VALUES (?, 'all', NULL)",
            (role_id,),
        )


def seed_default_admin(conn):
    current = now_str()
    admin = conn.execute(
        "SELECT id FROM sys_users WHERE username = ?",
        (DEFAULT_ADMIN_USERNAME,),
    ).fetchone()
    if not admin:
        cursor = conn.execute(
            """
            INSERT INTO sys_users (
                username, password_hash, display_name, phone, email, status,
                created_by, created_at, updated_at
            )
            VALUES (?, ?, ?, '', '', 'active', NULL, ?, ?)
            """,
            (
                DEFAULT_ADMIN_USERNAME,
                generate_password_hash(DEFAULT_ADMIN_PASSWORD),
                "系统管理员",
                current,
                current,
            ),
        )
        admin_id = cursor.lastrowid
    else:
        admin_id = admin["id"]

    admin_role = conn.execute("SELECT id FROM sys_roles WHERE role_code = 'hq_admin'").fetchone()
    conn.execute(
        "INSERT OR IGNORE INTO sys_user_roles (user_id, role_id) VALUES (?, ?)",
        (admin_id, admin_role["id"]),
    )


def generate_temporary_password(length=14):
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        password = "".join(secrets.choice(alphabet) for _ in range(length))
        if (
            any(char.islower() for char in password)
            and any(char.isupper() for char in password)
            and any(char.isdigit() for char in password)
            and any(char in "!@#$%^&*" for char in password)
        ):
            return password


def record_login_log(raw_db, username, user_id, result, failure_reason=None):
    with raw_db.get_connection() as conn:
        conn.execute(
            """
            INSERT INTO sys_login_logs (
                username, user_id, login_at, login_ip, result, failure_reason, user_agent
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                username,
                user_id,
                now_str(),
                get_client_ip(),
                result,
                failure_reason,
                request.headers.get("User-Agent", ""),
            ),
        )
        conn.commit()


def record_audit_log(raw_db, module, action, target_type=None, target_id=None, before_data=None, after_data=None, result="success", error_message=None):
    operator = getattr(g, "current_user", None) or {}
    with raw_db.get_connection() as conn:
        conn.execute(
            """
            INSERT INTO sys_audit_logs (
                operator_id, operator_name, module, action, target_type, target_id,
                before_data, after_data, result, error_message, ip_address, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                operator.get("id"),
                operator.get("display_name"),
                module,
                action,
                target_type,
                str(target_id) if target_id is not None else None,
                json.dumps(before_data, ensure_ascii=False) if before_data is not None else None,
                json.dumps(after_data, ensure_ascii=False) if after_data is not None else None,
                result,
                error_message,
                get_client_ip(),
                now_str(),
            ),
        )
        conn.commit()


def audit_api_response(raw_db, response):
    user = getattr(g, "current_user", None)
    if not user:
        return response
    rule = request.url_rule.rule if request.url_rule else request.path
    audit_info = AUDIT_API_ACTIONS.get((request.method, rule))
    if not audit_info:
        return response

    module, action, target_type = audit_info
    params = request.get_json(silent=True) if request.is_json else request.args.to_dict()
    record_audit_log(
        raw_db,
        module,
        action,
        target_type=target_type,
        after_data=params,
        result="success" if response.status_code < 400 else "fail",
        error_message=None if response.status_code < 400 else f"HTTP {response.status_code}",
    )
    return response


def get_user_by_id(raw_db, user_id):
    with raw_db.get_connection() as conn:
        user = conn.execute("SELECT * FROM sys_users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            return None
        user_data = row_to_dict(user)
        user_data["roles"] = get_user_roles(conn, user_id)
        user_data["permissions"] = get_user_permissions(conn, user_id)
        return user_data


def get_user_roles(conn, user_id):
    rows = conn.execute(
        """
        SELECT r.id, r.role_code, r.role_name, r.description, r.is_builtin, r.data_scope_type
        FROM sys_roles r
        JOIN sys_user_roles ur ON ur.role_id = r.id
        WHERE ur.user_id = ?
        ORDER BY r.id
        """,
        (user_id,),
    ).fetchall()
    return [row_to_dict(row) for row in rows]


def get_user_permissions(conn, user_id):
    rows = conn.execute(
        """
        SELECT DISTINCT p.permission_code
        FROM sys_permissions p
        JOIN sys_role_permissions rp ON rp.permission_id = p.id
        JOIN sys_user_roles ur ON ur.role_id = rp.role_id
        WHERE ur.user_id = ? AND p.is_enabled = 1
        ORDER BY p.permission_code
        """,
        (user_id,),
    ).fetchall()
    return [row["permission_code"] for row in rows]


def public_user_payload(user):
    return {
        "id": user["id"],
        "username": user["username"],
        "display_name": user["display_name"],
        "phone": user.get("phone") or "",
        "email": user.get("email") or "",
        "status": user["status"],
        "last_login_at": user.get("last_login_at"),
        "last_login_ip": user.get("last_login_ip"),
        "roles": user.get("roles", []),
        "permissions": user.get("permissions", []),
    }


def login(raw_db, username, password):
    username = (username or "").strip()
    if not username or not password:
        record_login_log(raw_db, username, None, "fail", "账号和密码不能为空")
        return None, "账号和密码不能为空"

    with raw_db.get_connection() as conn:
        user = conn.execute("SELECT * FROM sys_users WHERE username = ?", (username,)).fetchone()
        if not user:
            record_login_log(raw_db, username, None, "fail", "账号或密码错误")
            return None, "账号或密码错误"

        user_data = row_to_dict(user)
        if user_data["status"] != "active":
            record_login_log(raw_db, username, user_data["id"], "fail", "账号已停用")
            return None, "账号已停用"

        if not check_password_hash(user_data["password_hash"], password):
            record_login_log(raw_db, username, user_data["id"], "fail", "账号或密码错误")
            return None, "账号或密码错误"

        login_time = now_str()
        login_ip = get_client_ip()
        conn.execute(
            "UPDATE sys_users SET last_login_at = ?, last_login_ip = ?, updated_at = ? WHERE id = ?",
            (login_time, login_ip, login_time, user_data["id"]),
        )
        conn.commit()

    session.clear()
    session.permanent = True
    session["user_id"] = user_data["id"]
    record_login_log(raw_db, username, user_data["id"], "success")
    user = get_user_by_id(raw_db, user_data["id"])
    return user, None


def logout(raw_db):
    user = getattr(g, "current_user", None)
    if user:
        record_audit_log(raw_db, "登录认证", "退出", "user", user["id"])
    session.clear()


def load_current_user(raw_db):
    user_id = session.get("user_id")
    if not user_id:
        g.current_user = None
        return None
    user = get_user_by_id(raw_db, user_id)
    if not user or user["status"] != "active":
        session.clear()
        g.current_user = None
        return None
    g.current_user = user
    return user


def is_public_request():
    rule = request.url_rule.rule if request.url_rule else request.path
    return (request.method, rule) in PUBLIC_API_RULES


def get_permission_for_request():
    if request.path in ("/api/auth/me", "/api/auth/logout"):
        return None
    rule = request.url_rule.rule if request.url_rule else request.path
    candidates = []
    for item in flatten_permissions():
        if item["api_method"] and item["api_path"]:
            candidates.append((item["code"], item["api_method"], item["api_path"]))
    candidates.extend(OPERATIONS_EXTRA_API_PERMISSIONS)
    for code, method, api_path in candidates:
        if method == request.method and api_path == rule:
            return code
    return None


def require_api_access(raw_db):
    if not request.path.startswith("/api"):
        return None
    if is_public_request():
        return None

    user = load_current_user(raw_db)
    if not user:
        return jsonify({"success": False, "message": "未登录或登录已过期"}), 401

    permission_code = get_permission_for_request()
    if permission_code and permission_code not in user["permissions"]:
        return jsonify({"success": False, "message": "无权限访问该资源"}), 403
    return None


def require_permission(permission_code):
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            user = getattr(g, "current_user", None)
            if not user:
                return jsonify({"success": False, "message": "未登录或登录已过期"}), 401
            if permission_code not in user["permissions"]:
                return jsonify({"success": False, "message": "无权限访问该资源"}), 403
            return func(*args, **kwargs)

        return wrapper

    return decorator


def permission_tree(raw_db):
    with raw_db.get_connection() as conn:
        rows = conn.execute(
            """
            SELECT * FROM sys_permissions
            WHERE is_enabled = 1
            ORDER BY sort_order, id
            """
        ).fetchall()
    nodes = []
    by_id = {}
    for row in rows:
        node = row_to_dict(row)
        node["children"] = []
        by_id[node["id"]] = node
        if node["parent_id"] is None:
            nodes.append(node)
    for node in by_id.values():
        if node["parent_id"] is not None and node["parent_id"] in by_id:
            by_id[node["parent_id"]]["children"].append(node)
    return nodes


def list_users(raw_db, keyword="", role_id="", status=""):
    with raw_db.get_connection() as conn:
        conditions = []
        params = []
        if keyword:
            conditions.append("(u.username LIKE ? OR u.display_name LIKE ?)")
            params.extend([f"%{keyword}%", f"%{keyword}%"])
        if status:
            conditions.append("u.status = ?")
            params.append(status)
        if role_id:
            conditions.append("EXISTS (SELECT 1 FROM sys_user_roles ur2 WHERE ur2.user_id = u.id AND ur2.role_id = ?)")
            params.append(role_id)
        where = "WHERE " + " AND ".join(conditions) if conditions else ""
        rows = conn.execute(
            f"""
            SELECT u.*
            FROM sys_users u
            {where}
            ORDER BY u.created_at DESC, u.id DESC
            """,
            params,
        ).fetchall()
        users = []
        for row in rows:
            user = row_to_dict(row)
            user.pop("password_hash", None)
            user["roles"] = get_user_roles(conn, user["id"])
            users.append(user)
        return users


def user_detail(raw_db, user_id):
    with raw_db.get_connection() as conn:
        row = conn.execute("SELECT * FROM sys_users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            return None
        user = row_to_dict(row)
        user.pop("password_hash", None)
        roles = get_user_roles(conn, user_id)
        user["roles"] = roles
        user["role_ids"] = [role["id"] for role in roles]
        return user


def create_user(raw_db, payload, operator_id=None):
    username = (payload.get("username") or "").strip()
    display_name = (payload.get("display_name") or "").strip()
    password = payload.get("password") or generate_temporary_password()
    role_ids = payload.get("role_ids") or []
    if not username or not display_name:
        raise ValueError("登录账号和用户姓名不能为空")

    current = now_str()
    with raw_db.get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO sys_users (
                username, password_hash, display_name, phone, email, org_id,
                status, created_by, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                username,
                generate_password_hash(password),
                display_name,
                payload.get("phone") or "",
                payload.get("email") or "",
                payload.get("org_id"),
                payload.get("status") or "active",
                operator_id,
                current,
                current,
            ),
        )
        user_id = cursor.lastrowid
        replace_user_roles(conn, user_id, role_ids)
        conn.commit()
    return user_id, password


def update_user(raw_db, user_id, payload):
    role_ids = payload.get("role_ids")
    current = now_str()
    with raw_db.get_connection() as conn:
        before = row_to_dict(conn.execute("SELECT * FROM sys_users WHERE id = ?", (user_id,)).fetchone())
        if not before:
            raise ValueError("账号不存在")
        conn.execute(
            """
            UPDATE sys_users
            SET display_name = ?, phone = ?, email = ?, org_id = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                payload.get("display_name") or before["display_name"],
                payload.get("phone") or "",
                payload.get("email") or "",
                payload.get("org_id"),
                current,
                user_id,
            ),
        )
        if role_ids is not None:
            replace_user_roles(conn, user_id, role_ids)
        conn.commit()
    return before


def replace_user_roles(conn, user_id, role_ids):
    conn.execute("DELETE FROM sys_user_roles WHERE user_id = ?", (user_id,))
    for role_id in role_ids:
        conn.execute(
            "INSERT OR IGNORE INTO sys_user_roles (user_id, role_id) VALUES (?, ?)",
            (user_id, role_id),
        )


def set_user_status(raw_db, user_id, status, current_user_id):
    if status not in ("active", "disabled"):
        raise ValueError("账号状态不合法")
    if int(user_id) == int(current_user_id) and status == "disabled":
        raise ValueError("不能停用自己当前正在使用的账号")
    with raw_db.get_connection() as conn:
        user = conn.execute("SELECT * FROM sys_users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise ValueError("账号不存在")
        if user["username"] == DEFAULT_ADMIN_USERNAME and status == "disabled":
            raise ValueError("内置管理员账号不可停用")
        conn.execute(
            "UPDATE sys_users SET status = ?, updated_at = ? WHERE id = ?",
            (status, now_str(), user_id),
        )
        conn.commit()


def reset_user_password(raw_db, user_id, password=None):
    password = password or generate_temporary_password()
    with raw_db.get_connection() as conn:
        user = conn.execute("SELECT id FROM sys_users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            raise ValueError("账号不存在")
        conn.execute(
            "UPDATE sys_users SET password_hash = ?, updated_at = ? WHERE id = ?",
            (generate_password_hash(password), now_str(), user_id),
        )
        conn.commit()
    return password


def list_roles(raw_db):
    with raw_db.get_connection() as conn:
        rows = conn.execute(
            """
            SELECT r.*,
                   COUNT(DISTINCT ur.user_id) AS user_count
            FROM sys_roles r
            LEFT JOIN sys_user_roles ur ON ur.role_id = r.id
            GROUP BY r.id
            ORDER BY r.is_builtin DESC, r.id
            """
        ).fetchall()
        return [row_to_dict(row) for row in rows]


def role_detail(raw_db, role_id):
    with raw_db.get_connection() as conn:
        role = conn.execute("SELECT * FROM sys_roles WHERE id = ?", (role_id,)).fetchone()
        if not role:
            return None
        data = row_to_dict(role)
        rows = conn.execute(
            """
            SELECT p.permission_code
            FROM sys_permissions p
            JOIN sys_role_permissions rp ON rp.permission_id = p.id
            WHERE rp.role_id = ?
            ORDER BY p.sort_order
            """,
            (role_id,),
        ).fetchall()
        data["permissions"] = [row["permission_code"] for row in rows]
        return data


def create_role(raw_db, payload):
    role_code = (payload.get("role_code") or "").strip()
    role_name = (payload.get("role_name") or "").strip()
    if not role_code or not role_name:
        raise ValueError("角色编码和角色名称不能为空")
    current = now_str()
    with raw_db.get_connection() as conn:
        cursor = conn.execute(
            """
            INSERT INTO sys_roles (
                role_code, role_name, description, is_builtin, data_scope_type, created_at, updated_at
            )
            VALUES (?, ?, ?, 0, ?, ?, ?)
            """,
            (
                role_code,
                role_name,
                payload.get("description") or "",
                payload.get("data_scope_type") or "all",
                current,
                current,
            ),
        )
        role_id = cursor.lastrowid
        replace_role_permissions(conn, role_id, payload.get("permission_codes") or [])
        conn.commit()
    return role_id


def update_role(raw_db, role_id, payload):
    with raw_db.get_connection() as conn:
        role = conn.execute("SELECT * FROM sys_roles WHERE id = ?", (role_id,)).fetchone()
        if not role:
            raise ValueError("角色不存在")
        conn.execute(
            """
            UPDATE sys_roles
            SET role_name = ?, description = ?, data_scope_type = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                payload.get("role_name") or role["role_name"],
                payload.get("description") or "",
                payload.get("data_scope_type") or role["data_scope_type"],
                now_str(),
                role_id,
            ),
        )
        if "permission_codes" in payload:
            replace_role_permissions(conn, role_id, payload.get("permission_codes") or [])
        conn.commit()


def delete_role(raw_db, role_id):
    with raw_db.get_connection() as conn:
        role = conn.execute("SELECT * FROM sys_roles WHERE id = ?", (role_id,)).fetchone()
        if not role:
            raise ValueError("角色不存在")
        if role["is_builtin"]:
            raise ValueError("内置角色不可删除")
        count = conn.execute("SELECT COUNT(*) FROM sys_user_roles WHERE role_id = ?", (role_id,)).fetchone()[0]
        if count:
            raise ValueError("角色已被账号引用，不能删除")
        conn.execute("DELETE FROM sys_role_permissions WHERE role_id = ?", (role_id,))
        conn.execute("DELETE FROM sys_roles WHERE id = ?", (role_id,))
        conn.commit()


def replace_role_permissions(conn, role_id, permission_codes):
    conn.execute("DELETE FROM sys_role_permissions WHERE role_id = ?", (role_id,))
    rows = conn.execute(
        f"""
        SELECT id FROM sys_permissions
        WHERE permission_code IN ({",".join(["?"] * len(permission_codes))})
        """,
        permission_codes,
    ).fetchall() if permission_codes else []
    conn.executemany(
        "INSERT OR IGNORE INTO sys_role_permissions (role_id, permission_id) VALUES (?, ?)",
        [(role_id, row["id"]) for row in rows],
    )


def build_where(filters, allowed_fields):
    conditions = []
    params = []
    for key, value in filters.items():
        if value in (None, "") or key not in allowed_fields:
            continue
        field, operator, transform = allowed_fields[key]
        conditions.append(f"{field} {operator} ?")
        params.append(transform(value) if transform else value)
    return conditions, params


def list_login_logs(raw_db, limit=100, filters=None):
    filters = filters or {}
    with raw_db.get_connection() as conn:
        conditions, params = build_where(
            filters,
            {
                "username": ("username", "LIKE", lambda v: f"%{v}%"),
                "result": ("result", "=", None),
                "start_time": ("login_at", ">=", None),
                "end_time": ("login_at", "<=", None),
            },
        )
        where = "WHERE " + " AND ".join(conditions) if conditions else ""
        rows = conn.execute(
            f"""
            SELECT * FROM sys_login_logs
            {where}
            ORDER BY login_at DESC, id DESC
            LIMIT ?
            """,
            (*params, limit),
        ).fetchall()
        return [row_to_dict(row) for row in rows]


def login_log_detail(raw_db, log_id):
    with raw_db.get_connection() as conn:
        row = conn.execute("SELECT * FROM sys_login_logs WHERE id = ?", (log_id,)).fetchone()
        return row_to_dict(row)


def list_audit_logs(raw_db, limit=100, filters=None):
    filters = filters or {}
    with raw_db.get_connection() as conn:
        conditions, params = build_where(
            filters,
            {
                "operator": ("operator_name", "LIKE", lambda v: f"%{v}%"),
                "module": ("module", "=", None),
                "action": ("action", "=", None),
                "result": ("result", "=", None),
                "start_time": ("created_at", ">=", None),
                "end_time": ("created_at", "<=", None),
            },
        )
        where = "WHERE " + " AND ".join(conditions) if conditions else ""
        rows = conn.execute(
            f"""
            SELECT * FROM sys_audit_logs
            {where}
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (*params, limit),
        ).fetchall()
        return [row_to_dict(row) for row in rows]


def audit_log_detail(raw_db, log_id):
    with raw_db.get_connection() as conn:
        row = conn.execute("SELECT * FROM sys_audit_logs WHERE id = ?", (log_id,)).fetchone()
        return row_to_dict(row)


def data_scope_types():
    return [
        {"code": "all", "name": "全系统", "enabled": True},
        {"code": "region", "name": "所属大区", "enabled": False},
        {"code": "zone", "name": "所属战区", "enabled": False},
        {"code": "dealer", "name": "所属门店", "enabled": False},
        {"code": "custom", "name": "自定义门店范围", "enabled": False},
        {"code": "self", "name": "仅本人数据", "enabled": False},
    ]
