#!/usr/bin/env bash
set -euo pipefail

SERVER="${SERVER:-root@47.93.60.67}"
PROJECT_DIR="${PROJECT_DIR:-/home/leads-system/leads-operating}"
REMOTE_DB="${REMOTE_DB:-/home/leads-system/leads.db}"
REMOTE_DUCKDB="${REMOTE_DUCKDB:-/home/leads-system/leads-operating/data/leads_analytics.db}"
REMOTE_CONFIG_BACKUP="${REMOTE_CONFIG_BACKUP:-/home/leads-system/leads-operating/data/funnel_config_backup.json}"
LOCAL_DB="${LOCAL_DB:-../leads.db}"
KEEP_BACKUPS="${KEEP_BACKUPS:-2}"
HEALTH_WAIT_SECONDS="${HEALTH_WAIT_SECONDS:-600}"

log() { printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$*"; }

run_remote() {
    ssh "$SERVER" "$@"
}

wait_for_health() {
    local deadline=$((SECONDS + HEALTH_WAIT_SECONDS))
    local code="000"
    while [ "$SECONDS" -lt "$deadline" ]; do
        code="$(run_remote "curl --max-time 20 -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5001/api/health" || true)"
        if [ "$code" = "200" ]; then
            echo "$code"
            return 0
        fi
        sleep 20
    done
    echo "$code"
    return 1
}

log "Checking local database"
ls -lh "$LOCAL_DB"
sqlite3 "$LOCAL_DB" 'PRAGMA quick_check;'

log "Checking cloud server"
run_remote "echo connected; echo services: \$(systemctl is-active leads-backend) \$(systemctl is-active nginx); df -h /home/leads-system"

log "Uploading database to /tmp/leads.db.upload"
rsync -avz --progress -e ssh "$LOCAL_DB" "$SERVER:/tmp/leads.db.upload"

log "Running remote quick_check"
run_remote "sqlite3 /tmp/leads.db.upload 'PRAGMA quick_check;'"

log "Switching production database"
SWITCH_TS="$(
    run_remote "set -e
ts=\$(date +%Y%m%d%H%M%S)
systemctl stop leads-backend
trap 'systemctl start leads-backend' ERR
if [ -f '$REMOTE_DUCKDB' ]; then
  cd '$PROJECT_DIR'
  venv/bin/python3.11 - <<'PY'
import json
from pathlib import Path
import duckdb

from backend.config import DUCKDB_PATH

backup_path = Path('$REMOTE_CONFIG_BACKUP')
tables = [
    'funnel_national_visit_targets',
    'funnel_sales_targets',
    'funnel_conversion_rates',
    'funnel_model_mapping',
]

backup = {}
con = duckdb.connect(str(DUCKDB_PATH), read_only=True)
try:
    for table in tables:
        try:
            result = con.execute(f'SELECT * FROM {table}')
            columns = [desc[0] for desc in result.description]
            backup[table] = [
                {
                    key: (value.isoformat() if hasattr(value, 'isoformat') else value)
                    for key, value in zip(columns, row)
                }
                for row in result.fetchall()
            ]
        except Exception:
            backup[table] = []
finally:
    con.close()

if any(backup.values()):
    backup_path.parent.mkdir(parents=True, exist_ok=True)
    backup_path.write_text(json.dumps(backup, ensure_ascii=False), encoding='utf-8')
PY
  chown leadsapp:leadsapp '$REMOTE_CONFIG_BACKUP' 2>/dev/null || true
  chmod 0664 '$REMOTE_CONFIG_BACKUP' 2>/dev/null || true
fi
cp -a '$REMOTE_DB' '$REMOTE_DB.deploy-bak.'\$ts
install -m 0664 -o root -g root /tmp/leads.db.upload '$REMOTE_DB'
setfacl -m u:leadsapp:rwX '$REMOTE_DB'
rm -f /tmp/leads.db.upload
if [ -f '$REMOTE_DUCKDB' ]; then
  mv '$REMOTE_DUCKDB' '$REMOTE_DUCKDB.deploy-bak.'\$ts
fi
rm -f '$REMOTE_DUCKDB.wal' '$REMOTE_DUCKDB.tmp'
if [ -x /usr/local/sbin/leads-prune-db-backups ]; then
  /usr/local/sbin/leads-prune-db-backups '$KEEP_BACKUPS'
fi
systemctl restart leads-backend
trap - ERR
echo \$ts"
)"
echo "switched:$SWITCH_TS"

log "Waiting for backend health"
HEALTH_CODE="$(wait_for_health)"
if [ "$HEALTH_CODE" != "200" ]; then
    log "Backend health did not recover within ${HEALTH_WAIT_SECONDS}s"
    run_remote "systemctl status leads-backend --no-pager; journalctl -u leads-backend -n 160 --no-pager"
    exit 1
fi

log "Collecting verification"
run_remote "echo services: \$(systemctl is-active leads-backend) \$(systemctl is-active nginx)
echo api: \$(curl --max-time 15 -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5001/api/health)
echo public: \$(curl --max-time 15 -s -o /dev/null -w '%{http_code}' https://www.autosevice.xyz)
df -h /home/leads-system
echo ---backups---
find /home/leads-system -maxdepth 1 -type f \\( -name 'leads.db.deploy-bak.*' -o -name 'leads.db.bak.*' -o -name 'leads.db.pre-new-switch.*' \\) -printf '%TY-%Tm-%Td %TH:%TM %s %p\n' | sort -r
find '$PROJECT_DIR/data' -maxdepth 1 -type f \\( -name 'leads_analytics.db.deploy-bak.*' -o -name 'leads_analytics.db.bak.*' -o -name 'leads_analytics.db.pre-new-switch.*' \\) -printf '%TY-%Tm-%Td %TH:%TM %s %p\n' | sort -r"

log "Checking DuckDB table counts"
run_remote "cd '$PROJECT_DIR' && venv/bin/python3.11 - <<'PY'
from backend.config import DUCKDB_PATH
import duckdb
con = duckdb.connect(str(DUCKDB_PATH), read_only=True)
for table in ['metadata', 'mart_leads', 'mart_dealer_overdue_leads', 'mart_online_sales']:
    try:
        print(table, con.execute(f'select count(*) from {table}').fetchone()[0])
    except Exception as e:
        print(table, 'ERR', e)
try:
    print('overdue_range', con.execute('select min(assign_date), max(assign_date), count(distinct dealer_id) from mart_dealer_overdue_leads').fetchone())
except Exception as e:
    print('overdue_range ERR', e)
con.close()
PY"

log "Done"
