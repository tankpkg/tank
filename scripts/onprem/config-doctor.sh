#!/usr/bin/env bash
#
# Tank On-Prem Config Doctor
# Validates all required environment variables and service connectivity
# before starting the application.
#
# Usage:
#   ./scripts/onprem/config-doctor.sh
#   ./scripts/onprem/config-doctor.sh --fix
#

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

check_env() {
  local name="$1"
  local required="${2:-true}"
  
  if [[ -z "${!name:-}" ]]; then
    if [[ "$required" == "true" ]]; then
      echo -e "${RED}✗${NC} $name is not set (required)"
      ((ERRORS++))
    else
      echo -e "${YELLOW}○${NC} $name is not set (optional)"
      ((WARNINGS++))
    fi
  else
    echo -e "${GREEN}✓${NC} $name is set"
  fi
}

check_connectivity() {
  local name="$1"
  local host="$2"
  local port="$3"
  
  if command -v nc &> /dev/null; then
    if nc -z -w5 "$host" "$port" 2>/dev/null; then
      echo -e "${GREEN}✓${NC} $name connectivity ($host:$port)"
    else
      echo -e "${RED}✗${NC} $name not reachable at $host:$port"
      ((ERRORS++))
    fi
  elif command -v timeout &> /dev/null; then
    if timeout 5 bash -c "echo >/dev/tcp/$host/$port" 2>/dev/null; then
      echo -e "${GREEN}✓${NC} $name connectivity ($host:$port)"
    else
      echo -e "${RED}✗${NC} $name not reachable at $host:$port"
      ((ERRORS++))
    fi
  else
    echo -e "${YELLOW}○${NC} Cannot test $name connectivity (nc/timeout not available)"
    ((WARNINGS++))
  fi
}

echo "========================================="
echo "Tank On-Prem Configuration Doctor"
echo "========================================="
echo ""

# Parse AUTH_PROVIDERS
AUTH_PROVIDERS="${AUTH_PROVIDERS:-credentials}"
echo "Auth providers enabled: $AUTH_PROVIDERS"
echo ""

echo "--- Core Configuration ---"
check_env "BETTER_AUTH_SECRET" true
check_env "DATABASE_URL" true
check_env "NEXT_PUBLIC_APP_URL" false

echo ""
echo "--- Auth Provider Configuration ---"

if [[ "$AUTH_PROVIDERS" == *"credentials"* ]]; then
  echo "Checking credentials auth..."
  check_env "RESEND_API_KEY" false
  check_env "EMAIL_FROM" false
fi

if [[ "$AUTH_PROVIDERS" == *"github"* ]]; then
  echo "Checking GitHub OAuth..."
  check_env "GITHUB_CLIENT_ID" true
  check_env "GITHUB_CLIENT_SECRET" true
fi

if [[ "$AUTH_PROVIDERS" == *"oidc"* ]]; then
  echo "Checking OIDC SSO..."
  check_env "OIDC_CLIENT_ID" true
  check_env "OIDC_CLIENT_SECRET" true
  check_env "OIDC_PROVIDER_ID" false
  check_env "NEXT_PUBLIC_OIDC_PROVIDER_ID" false
  
  # Check discovery OR manual endpoints
  if [[ -n "${OIDC_DISCOVERY_URL:-}" ]]; then
    echo -e "${GREEN}✓${NC} OIDC_DISCOVERY_URL is set"
  elif [[ -n "${OIDC_AUTHORIZATION_URL:-}" && -n "${OIDC_TOKEN_URL:-}" && -n "${OIDC_USER_INFO_URL:-}" ]]; then
    echo -e "${GREEN}✓${NC} OIDC manual endpoints are set"
  else
    echo -e "${RED}✗${NC} OIDC requires either OIDC_DISCOVERY_URL or all of (OIDC_AUTHORIZATION_URL, OIDC_TOKEN_URL, OIDC_USER_INFO_URL)"
    ((ERRORS++))
  fi
fi

echo ""
echo "--- Storage Configuration ---"
STORAGE_BACKEND="${STORAGE_BACKEND:-supabase}"
echo "Storage backend: $STORAGE_BACKEND"

if [[ "$STORAGE_BACKEND" == "s3" ]]; then
  check_env "S3_ACCESS_KEY" true
  check_env "S3_SECRET_KEY" true
  check_env "S3_BUCKET" false
  check_env "S3_REGION" false
  check_env "S3_ENDPOINT" false
elif [[ "$STORAGE_BACKEND" == "supabase" ]]; then
  check_env "SUPABASE_URL" true
  check_env "SUPABASE_SERVICE_ROLE_KEY" true
fi

echo ""
echo "--- Session Store Configuration ---"
SESSION_STORE="${SESSION_STORE:-memory}"
echo "Session store: $SESSION_STORE"

if [[ "$SESSION_STORE" == "redis" ]]; then
  check_env "REDIS_URL" true
fi

echo ""
echo "--- Service Connectivity ---"

# Parse DATABASE_URL for connectivity test
if [[ -n "${DATABASE_URL:-}" ]]; then
  # Extract host and port from postgresql://user:pass@host:port/db
  DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
  DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
  if [[ -n "$DB_HOST" && -n "$DB_PORT" ]]; then
    check_connectivity "PostgreSQL" "$DB_HOST" "$DB_PORT"
  fi
fi

# Parse REDIS_URL for connectivity test
if [[ -n "${REDIS_URL:-}" ]]; then
  # Extract host and port from redis://host:port
  REDIS_HOST=$(echo "$REDIS_URL" | sed -n 's/redis:\/\/\([^:]*\):.*/\1/p')
  REDIS_PORT=$(echo "$REDIS_URL" | sed -n 's/redis:\/\/[^:]*:\([0-9]*\)/\1/p')
  if [[ -n "$REDIS_HOST" && -n "$REDIS_PORT" ]]; then
    check_connectivity "Redis" "$REDIS_HOST" "$REDIS_PORT"
  fi
fi

# Check MinIO/S3 if using S3 backend
if [[ "$STORAGE_BACKEND" == "s3" && -n "${S3_ENDPOINT:-}" ]]; then
  # Extract host and port from http://host:port
  S3_HOST=$(echo "$S3_ENDPOINT" | sed -n 's|http://\([^:]*\):.*|\1|p')
  S3_PORT=$(echo "$S3_ENDPOINT" | sed -n 's|http://[^:]*:\([0-9]*\)|\1|p')
  if [[ -n "$S3_HOST" && -n "$S3_PORT" ]]; then
    check_connectivity "MinIO/S3" "$S3_HOST" "$S3_PORT"
  fi
fi

# Check Python scanner
if [[ -n "${PYTHON_API_URL:-}" ]]; then
  SCANNER_HOST=$(echo "$PYTHON_API_URL" | sed -n 's|http://\([^:]*\):.*|\1|p')
  SCANNER_PORT=$(echo "$PYTHON_API_URL" | sed -n 's|http://[^:]*:\([0-9]*\)|\1|p')
  if [[ -n "$SCANNER_HOST" && -n "$SCANNER_PORT" ]]; then
    check_connectivity "Python Scanner" "$SCANNER_HOST" "$SCANNER_PORT"
  fi
fi

echo ""
echo "========================================="
echo "Summary"
echo "========================================="
echo -e "Errors:   ${RED}$ERRORS${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"
echo ""

if [[ $ERRORS -gt 0 ]]; then
  echo -e "${RED}Configuration check failed. Fix the errors above before starting.${NC}"
  exit 1
else
  echo -e "${GREEN}Configuration check passed!${NC}"
  if [[ $WARNINGS -gt 0 ]]; then
    echo -e "${YELLOW}Note: Some optional settings are missing.${NC}"
  fi
  exit 0
fi
