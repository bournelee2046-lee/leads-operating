#!/usr/bin/env bash
set -euo pipefail

KEEP_BACKUPS="${1:-${KEEP_DB_BACKUPS:-2}}"
SQLITE_BACKUP_DIR="${SQLITE_BACKUP_DIR:-/home/leads-system}"
DUCKDB_BACKUP_DIR="${DUCKDB_BACKUP_DIR:-/home/leads-system/leads-operating/data}"

if ! [[ "$KEEP_BACKUPS" =~ ^[0-9]+$ ]] || [ "$KEEP_BACKUPS" -lt 1 ]; then
    echo "KEEP_BACKUPS must be a positive integer" >&2
    exit 2
fi

prune_backups() {
    local label="$1"
    local directory="$2"
    shift 2

    if [ ! -d "$directory" ]; then
        echo "[$label] skip missing directory: $directory"
        return
    fi

    local files=()
    local entry
    while IFS= read -r -d '' entry; do
        files+=("${entry#* }")
    done < <(
        find "$directory" -maxdepth 1 -type f \( "$@" \) -printf '%T@ %p\0' | sort -z -nr
    )

    local total="${#files[@]}"
    echo "[$label] found $total backup file(s), keeping latest $KEEP_BACKUPS"

    local index=0
    local file
    for file in "${files[@]}"; do
        index=$((index + 1))
        if [ "$index" -le "$KEEP_BACKUPS" ]; then
            echo "[$label] keep: $file"
        else
            echo "[$label] delete: $file"
            rm -f -- "$file"
        fi
    done
}

prune_backups "sqlite" "$SQLITE_BACKUP_DIR" \
    -name 'leads.db.deploy-bak.*' -o \
    -name 'leads.db.bak.*' -o \
    -name 'leads.db.pre-new-switch.*'

prune_backups "duckdb" "$DUCKDB_BACKUP_DIR" \
    -name 'leads_analytics.db.deploy-bak.*' -o \
    -name 'leads_analytics.db.bak.*' -o \
    -name 'leads_analytics.db.pre-new-switch.*'
