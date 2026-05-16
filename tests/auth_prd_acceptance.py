from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from backend.app_v2 import app
from backend.auth.service import (
    DEFAULT_ADMIN_PASSWORD,
    DEFAULT_ADMIN_USERNAME,
    create_role,
    create_user,
    initialize_auth_system,
    list_audit_logs,
    list_login_logs,
)
from backend.core.db_manager import AuthDBManager, RawDBManager


def assert_status(response, expected):
    assert response.status_code == expected, f"expected {expected}, got {response.status_code}: {response.get_data(as_text=True)}"


def login(client, username=DEFAULT_ADMIN_USERNAME, password=DEFAULT_ADMIN_PASSWORD):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def run():
    raw_db_path = Path("/private/tmp/leads_raw_prd_acceptance.db")
    auth_db_path = Path("/private/tmp/leads_auth_prd_acceptance.db")
    for db_path in (raw_db_path, auth_db_path):
        if db_path.exists():
            db_path.unlink()

    raw_db = RawDBManager(raw_db_path)
    auth_db = AuthDBManager(auth_db_path)
    initialize_auth_system(auth_db)
    initialize_auth_system(auth_db)

    app.config.update(TESTING=True, SECRET_KEY="acceptance-test")
    original_raw_db = app.view_functions["health_check"].__globals__["raw_db"]
    original_auth_db = app.view_functions["health_check"].__globals__["auth_db"]
    original_duck_db = app.view_functions["health_check"].__globals__["duck_db"]
    app.view_functions["health_check"].__globals__["raw_db"] = raw_db
    app.view_functions["health_check"].__globals__["auth_db"] = auth_db

    class FakeDuckDB:
        def get_dashboard_data(self, period="day"):
            return {"kpis": [], "new_kpis": [], "period": period}

    app.view_functions["health_check"].__globals__["duck_db"] = FakeDuckDB()

    try:
        anonymous = app.test_client()
        assert_status(anonymous.get("/api/dashboard"), 401)
        assert_status(anonymous.get("/api/health"), 200)

        bad_login = anonymous.post("/api/auth/login", json={"username": DEFAULT_ADMIN_USERNAME, "password": "wrong"})
        assert_status(bad_login, 401)

        admin = app.test_client()
        ok_login = login(admin)
        assert_status(ok_login, 200)
        admin_me = admin.get("/api/auth/me")
        assert_status(admin_me, 200)
        permissions = set(admin_me.get_json()["data"]["permissions"])
        assert "admin.users.view" in permissions

        assert_status(admin.get("/api/dashboard"), 200)

        roles = admin.get("/api/admin/roles").get_json()["data"]
        operator_role = next(role for role in roles if role["role_code"] == "hq_operator")
        admin_role = next(role for role in roles if role["role_code"] == "hq_admin")

        created_user = admin.post(
            "/api/admin/users",
            json={
                "username": "operator_test",
                "password": "Operator@123",
                "display_name": "运营测试",
                "status": "active",
                "role_ids": [operator_role["id"]],
            },
        )
        assert_status(created_user, 200)
        operator_id = created_user.get_json()["data"]["id"]

        operator = app.test_client()
        assert_status(operator.post("/api/auth/login", json={"username": "operator_test", "password": "Operator@123"}), 200)
        assert_status(operator.get("/api/admin/users"), 403)

        self_disable = admin.patch(f"/api/admin/users/{admin_me.get_json()['data']['id']}/status", json={"status": "disabled"})
        assert_status(self_disable, 400)

        disable_operator = admin.patch(f"/api/admin/users/{operator_id}/status", json={"status": "disabled"})
        assert_status(disable_operator, 200)
        disabled_login = app.test_client().post("/api/auth/login", json={"username": "operator_test", "password": "Operator@123"})
        assert_status(disabled_login, 401)

        builtin_delete = admin.delete(f"/api/admin/roles/{admin_role['id']}")
        assert_status(builtin_delete, 400)

        custom_role = admin.post(
            "/api/admin/roles",
            json={"role_code": "acceptance_role", "role_name": "验收角色", "description": "引用删除校验", "permission_codes": []},
        )
        assert_status(custom_role, 200)
        custom_role_id = custom_role.get_json()["data"]["id"]
        linked_user = admin.post(
            "/api/admin/users",
            json={
                "username": "linked_user",
                "password": "Linked@123",
                "display_name": "引用用户",
                "status": "active",
                "role_ids": [custom_role_id],
            },
        )
        assert_status(linked_user, 200)
        referenced_delete = admin.delete(f"/api/admin/roles/{custom_role_id}")
        assert_status(referenced_delete, 400)

        permission_user = admin.post(
            "/api/admin/users",
            json={
                "username": "permission_user",
                "password": "Permission@123",
                "display_name": "权限用户",
                "status": "active",
                "role_ids": [operator_role["id"]],
            },
        )
        assert_status(permission_user, 200)

        permission_update = admin.put(
            f"/api/admin/roles/{operator_role['id']}/permissions",
            json={"permission_codes": ["home.view", "home.dashboard.view"]},
        )
        assert_status(permission_update, 200)
        operator_after_change = app.test_client()
        assert_status(operator_after_change.post("/api/auth/login", json={"username": "permission_user", "password": "Permission@123"}), 200)
        changed_me = operator_after_change.get("/api/auth/me").get_json()["data"]
        assert "home.dashboard.view" in changed_me["permissions"]
        assert "admin.users.view" not in changed_me["permissions"]

        audit_logs = list_audit_logs(auth_db, filters={"module": "账号管理", "result": "success"})
        login_logs = list_login_logs(auth_db, filters={"username": "admin"})
        assert audit_logs, "expected audit logs"
        assert login_logs, "expected login logs"

        with raw_db.get_connection() as conn:
            rows = conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'sys_%'").fetchall()
            assert not rows, f"raw business db should not contain auth tables: {[row['name'] for row in rows]}"

        print("PRD acceptance smoke ok")
    finally:
        app.view_functions["health_check"].__globals__["raw_db"] = original_raw_db
        app.view_functions["health_check"].__globals__["auth_db"] = original_auth_db
        app.view_functions["health_check"].__globals__["duck_db"] = original_duck_db


if __name__ == "__main__":
    run()
