#!/bin/bash
# ============================================================
#  FitTrack — PostgreSQL Restore Script
#  Usage: ./restore.sh fittrack_2026-04-27_09-00-00.sql.gz
#
#  WARNING: This will overwrite the current database!
# ============================================================

BACKUP_DIR="/mnt/user/appdata/fittrack/backups"
CONTAINER="fittrack-db"
DB_NAME="fittrack"
DB_USER="postgres"

# ── Validate argument ─────────────────────────────────────────
if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    echo ""
    echo "Available backups:"
    ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null | awk '{print "  " $5 "  " $9}'
    exit 1
fi

BACKUP_FILE="$BACKUP_DIR/$1"

if [ ! -f "$BACKUP_FILE" ]; then
    # Try with full path
    BACKUP_FILE="$1"
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $1"
    exit 1
fi

# ── Confirm ───────────────────────────────────────────────────
echo "WARNING: This will overwrite the '$DB_NAME' database with:"
echo "  $BACKUP_FILE"
echo ""
read -p "Are you sure? Type 'yes' to continue: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# ── Restore ───────────────────────────────────────────────────
echo "[$(date)] Starting restore from: $BACKUP_FILE"

# Drop and recreate the database
docker exec "$CONTAINER" psql -U "$DB_USER" -c "DROP DATABASE IF EXISTS ${DB_NAME};"
docker exec "$CONTAINER" psql -U "$DB_USER" -c "CREATE DATABASE ${DB_NAME} OWNER fittrack;"

# Restore from backup
gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER" psql -U "$DB_USER" "$DB_NAME"

if [ $? -eq 0 ]; then
    echo "[$(date)] Restore complete!"
    echo "Restart the API to reconnect: docker compose restart api"
else
    echo "[$(date)] ERROR: Restore failed!" >&2
    exit 1
fi
