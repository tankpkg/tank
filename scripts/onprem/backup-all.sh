#!/bin/bash
set -euo pipefail

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_DIR:-/backups/tank_${DATE}}"
S3_ENDPOINT="${S3_ENDPOINT:-http://minio:9000}"
S3_ACCESS_KEY="${S3_ACCESS_KEY:?S3_ACCESS_KEY is required}"
S3_SECRET_KEY="${S3_SECRET_KEY:?S3_SECRET_KEY is required}"
S3_BUCKET="${S3_BUCKET:-packages}"
POSTGRES_HOST="${POSTGRES_HOST:-postgres}"
POSTGRES_USER="${POSTGRES_USER:-tank}"
POSTGRES_DB="${POSTGRES_DB:-tank}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

mkdir -p "$BACKUP_DIR"

echo "=== Starting full Tank backup ==="
echo "Backup directory: $BACKUP_DIR"
echo "Timestamp: $DATE"

echo ""
echo "1. Backing up PostgreSQL database..."
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" "$POSTGRES_DB" > "$BACKUP_DIR/database.sql"
echo "   Database backup size: $(du -sh "$BACKUP_DIR/database.sql" | cut -f1)"

echo ""
echo "2. Backing up MinIO object storage..."
mc alias set tank-minio "${S3_ENDPOINT}" "${S3_ACCESS_KEY}" "${S3_SECRET_KEY}" 2>/dev/null || true
mc mirror tank-minio/"${S3_BUCKET}" "$BACKUP_DIR/minio-packages" 2>/dev/null || {
    echo "   Warning: MinIO backup may be incomplete"
}
echo "   Object storage backup size: $(du -sh "$BACKUP_DIR/minio-packages" 2>/dev/null | cut -f1 || echo 'N/A')"

echo ""
echo "3. Saving configuration templates..."
if [ -f ".env.example.onprem" ]; then
    cp .env.example.onprem "$BACKUP_DIR/env.template"
fi
if [ -f "infra/docker-compose.yml" ]; then
    cp infra/docker-compose.yml "$BACKUP_DIR/"
fi

echo ""
echo "=== Backup complete ==="
echo "Total backup size: $(du -sh "$BACKUP_DIR" | cut -f1)"
echo "Location: $BACKUP_DIR"

echo ""
echo "To restore from this backup:"
echo "  1. Database: cat $BACKUP_DIR/database.sql | docker exec -i tank-postgres psql -U tank tank"
echo "  2. Storage:  mc mirror $BACKUP_DIR/minio-packages tank-minio/packages"
