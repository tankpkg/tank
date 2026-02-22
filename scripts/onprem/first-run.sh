#!/usr/bin/env bash
#
# Tank On-Prem First Run Setup
# One-command initialization for fresh deployments.
#
# Usage:
#   ./scripts/onprem/first-run.sh
#
# This script:
#   1. Validates configuration
#   2. Waits for services to be healthy
#   3. Runs database migrations
#   4. Creates MinIO bucket (if needed)
#   5. Verifies the stack is working
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================="
echo "Tank On-Prem First Run Setup"
echo "========================================="
echo ""

# Step 1: Validate configuration
echo -e "${YELLOW}Step 1: Validating configuration...${NC}"
"$SCRIPT_DIR/config-doctor.sh"

# Step 2: Wait for services
echo ""
echo -e "${YELLOW}Step 2: Waiting for services to be healthy...${NC}"

wait_for_service() {
  local name="$1"
  local url="$2"
  local max_attempts=30
  local attempt=1
  
  echo -n "Waiting for $name..."
  while [[ $attempt -le $max_attempts ]]; do
    if curl -sf "$url" > /dev/null 2>&1; then
      echo " OK"
      return 0
    fi
    echo -n "."
    sleep 2
    ((attempt++))
  done
  echo " FAILED"
  echo "Error: $name did not become healthy within 60 seconds"
  return 1
}

# Wait for web app (depends on all other services)
wait_for_service "Tank Web" "${NEXT_PUBLIC_APP_URL:-http://localhost:3000}/api/health"

# Step 3: Run database migrations
echo ""
echo -e "${YELLOW}Step 3: Running database migrations...${NC}"
"$SCRIPT_DIR/init-db.sh"

# Step 4: Create MinIO bucket if using S3 backend
if [[ "${STORAGE_BACKEND:-s3}" == "s3" ]]; then
  echo ""
  echo -e "${YELLOW}Step 4: Ensuring MinIO bucket exists...${NC}"
  
  BUCKET="${S3_BUCKET:-packages}"
  
  # Use mc (MinIO client) if available
  if command -v mc &> /dev/null; then
    mc alias set tank-minio "${S3_ENDPOINT:-http://localhost:9000}" \
      "${S3_ACCESS_KEY:-tank}" "${S3_SECRET_KEY:-tank123456}" 2>/dev/null || true
    mc mb tank-minio/$BUCKET --ignore-existing 2>/dev/null || true
    echo "Bucket '$BUCKET' ready"
  else
    echo "Note: Install 'mc' (MinIO client) to auto-create buckets, or create '$BUCKET' manually via MinIO console"
  fi
fi

# Step 5: Verify stack
echo ""
echo -e "${YELLOW}Step 5: Verifying stack...${NC}"

# Test health endpoint
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "${NEXT_PUBLIC_APP_URL:-http://localhost:3000}/api/health")
if [[ "$HTTP_CODE" == "200" ]]; then
  echo -e "${GREEN}✓${NC} Web app is responding"
else
  echo "Warning: Web app health check returned HTTP $HTTP_CODE"
fi

echo ""
echo "========================================="
echo -e "${GREEN}First run setup complete!${NC}"
echo "========================================="
echo ""
echo "Your Tank instance is ready at: ${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
echo ""
echo "Next steps:"
echo "  1. Create your first admin account via the login page"
echo "  2. Configure any additional auth providers in .env"
echo "  3. Review docs/onprem-enterprise.md for production hardening"
echo ""
