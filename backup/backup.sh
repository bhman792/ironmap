#!/bin/bash
# ============================================================
#  FitTrack — PostgreSQL Backup Script
#  Runs via cron, saves compressed dumps to Unraid share
#
#  Place at: /mnt/user/appdata/fittrack/backup/backup.sh
#  Make executable: chmod +x backup.sh
# ============================================================

# ── Config ───────────────────────────────────────────────────
BACKUP_DIR="/mnt/user/appdata/fittrack/backups"
CONTAINER="fittrack-db"
DB_NAME="fittrack"
DB_USER="postgres"
KEEP_DAYS=30          # delete backups older than this
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
FILENAME="fittrack_${TIMESTAMP}.sql.gz"

# ── Create backup dir if it doesn't exist ────────────────────
mkdir -p "$BACKUP_DIR"

# ── Run the backup ───────────────────────────────────────────
echo "[$(date)] Starting backup: $FILENAME"

docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_DIR/$FILENAME"

if [ $? -eq 0 ]; then
    SIZE=$(du -sh "$BACKUP_DIR/$FILENAME" | cut -f1)
    echo "[$(date)] Backup complete: $FILENAME ($SIZE)"
else
    echo "[$(date)] ERROR: Backup failed!" >&2
    exit 1
fi

# ── Delete old backups ───────────────────────────────────────
echo "[$(date)] Removing backups older than $KEEP_DAYS days..."
find "$BACKUP_DIR" -name "fittrack_*.sql.gz" -mtime +$KEEP_DAYS -delete
echo "[$(date)] Cleanup complete."

# ── List current backups ─────────────────────────────────────
echo "[$(date)] Current backups:"
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null | awk '{print "  " $5 "  " $9}'
