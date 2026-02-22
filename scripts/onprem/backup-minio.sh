#!/bin/bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups/minio}"
DATE=$(date +%Y%m%d_%H%M%S)
S3_ENDPOINT="${S3_ENDPOINT:-http://minio:9000}"
S3_ACCESS_KEY="${S3_ACCESS_KEY:?S3_ACCESS_KEY is required}"
S3_SECRET_KEY="${S3_SECRET_KEY:?S3_SECRET_KEY is required}"
S3_BUCKET="${S3_BUCKET:-packages}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

mkdir -p "$BACKUP_DIR"

mc alias set tank-minio "${S3_ENDPOINT}" "${S3_ACCESS_KEY}" "${S3_SECRET_KEY}" 2>/dev/null || {
    echo "Error: Failed to configure mc alias for MinIO"
    exit 1
}

echo "Starting MinIO backup: ${S3_BUCKET} -> ${BACKUP_DIR}/packages_${DATE}"
mc mirror tank-minio/"${S3_BUCKET}" "${BACKUP_DIR}/packages_${DATE}"

find "${BACKUP_DIR}" -name "packages_*" -type d -mtime +"${RETENTION_DAYS}" -exec rm -rf {} \; 2>/dev/null || true

echo "Backup complete: ${BACKUP_DIR}/packages_${DATE}"
echo "Size: $(du -sh "${BACKUP_DIR}/packages_${DATE}" | cut -f1)"
