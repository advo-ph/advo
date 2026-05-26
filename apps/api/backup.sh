#!/bin/bash
# ─────────────────────────────────────────────────────────
# ADVO DB Backup — run via cron daily
# crontab -e → 0 3 * * * /opt/advo-api/backup.sh
# ─────────────────────────────────────────────────────────

BACKUP_DIR="/var/backups/advo"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
KEEP_DAYS=14

mkdir -p "$BACKUP_DIR"

pg_dump -Fc advo > "$BACKUP_DIR/advo_${TIMESTAMP}.dump"

# Remove backups older than $KEEP_DAYS
find "$BACKUP_DIR" -name "*.dump" -mtime +$KEEP_DAYS -delete

echo "Backup complete: advo_${TIMESTAMP}.dump"
