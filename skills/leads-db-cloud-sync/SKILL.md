---
name: leads-db-cloud-sync
description: Use when the user asks to sync or update the local leads.db database to the Aliyun cloud server for the leads operating system, including upload, SQLite integrity checks, production backup rotation, DuckDB rebuild, service restart, and health verification.
metadata:
  short-description: Sync local leads.db to the production cloud server safely
---

# Leads DB Cloud Sync

Use this skill when the user asks to update/sync the latest local `leads.db` to the cloud server.

## Defaults

- Workspace: `/Users/bournelll/Desktop/线索运营/线索运营监控系统`
- Local SQLite DB: `../leads.db`
- Server: `root@47.93.60.67`
- Remote SQLite DB: `/home/leads-system/leads.db`
- Remote DuckDB: `/home/leads-system/leads-operating/data/leads_analytics.db`
- Remote funnel config backup: `/home/leads-system/leads-operating/data/funnel_config_backup.json`
- Backend service: `leads-backend`
- Nginx service: `nginx`
- Backup retention: keep latest `2` SQLite backups and latest `2` DuckDB backups

## Procedure

Prefer the bundled script:

```bash
skills/leads-db-cloud-sync/scripts/sync_leads_db.sh
```

The script performs the safe sequence:

1. Verify local `../leads.db` exists and passes `PRAGMA quick_check`.
2. Verify SSH connectivity, service status, and remote disk space.
3. Upload local DB to `/tmp/leads.db.upload` using `rsync`.
4. Run remote `PRAGMA quick_check` on the uploaded file.
5. Stop `leads-backend` so the current DuckDB can be read without a write lock.
6. Export the latest cloud-side funnel config tables from current DuckDB to `data/funnel_config_backup.json`.
7. Back up current `/home/leads-system/leads.db` with a timestamp.
8. Install uploaded DB as the current production DB.
9. Move current DuckDB analytics DB to a timestamped backup so it rebuilds from the new SQLite source.
10. Remove temporary upload and stale DuckDB WAL/temp files.
11. Run `/usr/local/sbin/leads-prune-db-backups 2` when available; otherwise prune with the script's fallback logic.
12. Restart `leads-backend`.
13. Wait for `/api/health` to return `200`, then verify public site, services, backup retention, disk space, and key DuckDB table counts.

## Manual Safety Rules

- Do not replace production DB until both local and remote `quick_check` return `ok`.
- Preserve cloud-maintained funnel config before rebuilding DuckDB. In particular, export the current DuckDB tables below to `data/funnel_config_backup.json` before moving `leads_analytics.db`:
  - `funnel_national_visit_targets`
  - `funnel_sales_targets`
  - `funnel_conversion_rates`
  - `funnel_model_mapping`
- Do not delete current runtime files:
  - `/home/leads-system/leads.db`
  - `/home/leads-system/leads.db-shm`
  - `/home/leads-system/leads.db-wal`
  - `/home/leads-system/leads-operating/data/leads_analytics.db`
- Only delete timestamped backups matching:
  - `leads.db.deploy-bak.*`
  - `leads.db.bak.*`
  - `leads.db.pre-new-switch.*`
  - `leads_analytics.db.deploy-bak.*`
  - `leads_analytics.db.bak.*`
  - `leads_analytics.db.pre-new-switch.*`
- After restart, allow several minutes for DuckDB rebuild before treating health-check timeouts as failure.

## Expected Final Report

Report these items concisely:

- Whether local and remote `quick_check` returned `ok`
- Timestamp of the new backup/switch
- Service status for `leads-backend` and `nginx`
- HTTP code for `/api/health` and `https://www.autosevice.xyz`
- Key table counts:
  - `mart_leads`
  - `mart_dealer_overdue_leads`
  - `mart_online_sales`
- Overdue data date range and distinct dealer count
- Remaining disk space
- Confirm only latest 2 SQLite and latest 2 DuckDB backups remain
- Confirm cloud-maintained funnel config was exported before DuckDB rebuild
