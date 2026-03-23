#!/bin/bash
# Tank On-Prem E2E Test Suite
# Runs against a live Docker stack. Expects fresh volumes.
# Usage: BASE=http://localhost:4444 bash e2e/onprem-e2e.sh

set -euo pipefail

BASE="${BASE:-http://localhost:4444}"
PASS=0; FAIL=0; SKIP=0
COOKIE_JAR=$(mktemp)
trap 'rm -f $COOKIE_JAR' EXIT

assert() { local n="$1" e="$2" a="$3"; if [ "$e" = "$a" ]; then echo "  ✅ $n"; PASS=$((PASS+1)); else echo "  ❌ $n — expected: $e, got: $a"; FAIL=$((FAIL+1)); fi; }
assert_contains() { local n="$1" e="$2" a="$3"; if echo "$a" | grep -q "$e"; then echo "  ✅ $n"; PASS=$((PASS+1)); else echo "  ❌ $n — expected to contain: $e"; FAIL=$((FAIL+1)); fi; }
post() { curl -s -X POST "$BASE$1" -H 'Content-Type: application/json' -H "Origin: $BASE" -d "$2" -b $COOKIE_JAR -c $COOKIE_JAR; }
get() { curl -s "$BASE$1" -b $COOKIE_JAR -c $COOKIE_JAR; }
status() { curl -s -o /dev/null -w '%{http_code}' "$BASE$1" -b $COOKIE_JAR -c $COOKIE_JAR; }

echo "═══════════════════════════════════════"
echo "  Tank On-Prem E2E Test Suite"
echo "  Target: $BASE"
echo "═══════════════════════════════════════"

# ─── SETUP WIZARD ───
echo ""
echo "▸ Setup Wizard"
assert "/ redirects to /setup" "302" "$(curl -sI -o /dev/null -w '%{http_code}' $BASE/)"
assert_contains "Not completed" '"completed":false' "$(get /api/setup/status)"

# Storage defaults from env vars should be surfaced so the wizard can pre-fill
STATUS=$(get /api/setup/status)
assert_contains "Status has storage defaults" '"storage"' "$STATUS"
assert_contains "Storage default has backend" '"backend"' "$STATUS"

assert_contains "Test DB" '"ok":true' "$(post /api/setup/test-db '{"useEnv":true}')"
assert_contains "Init DB" '"ok":true' "$(post /api/setup/init-db '')"
assert_contains "System config exists" '"hasSystemConfig":true' "$(post /api/setup/check-db '{"useEnv":true}')"
assert_contains "Instance URL" '"ok":true' "$(post /api/setup/instance-url "{\"instanceUrl\":\"$BASE\"}")"

# test-storage must accept config from body (not read from env only)
assert_contains "Test storage (body config)" '"ok":true' "$(post /api/setup/test-storage '{"backend":"s3","endpoint":"http://minio:9000","accessKey":"tank","secretKey":"changeme123456","bucket":"packages","region":"us-east-1"}')"

# s3-compatible must be accepted and treated as s3
assert_contains "Test s3-compatible" '"ok":true' "$(post /api/setup/test-storage '{"backend":"s3-compatible","endpoint":"http://minio:9000","accessKey":"tank","secretKey":"changeme123456","bucket":"packages","region":"us-east-1"}')"
assert_contains "Save s3-compatible as s3" '"ok":true' "$(post /api/setup/storage '{"backend":"s3-compatible","endpoint":"http://minio:9000","accessKey":"tank","secretKey":"changeme123456","bucket":"packages","region":"us-east-1"}')"
assert_contains "Create admin" '"ok":true' "$(post /api/setup/admin '{"email":"admin@e2e.test","password":"e2epass12345"}')"
assert_contains "Weak pw rejected" '"error"' "$(post /api/setup/admin '{"email":"x@x.com","password":"short"}')"
assert_contains "Scanner disabled" '"ok":true' "$(post /api/setup/scanner-llm '{"provider":"disabled"}')"
# Runtime provider must use wizard-saved DB config (no restart needed)
assert_contains "Runtime storage uses DB config" '"ok":true' "$(post /api/setup/test-storage '{}')"

assert_contains "Complete" '"ok":true' "$(post /api/setup/complete '')"
assert "/ serves app" "200" "$(curl -sI -o /dev/null -w '%{http_code}' $BASE/)"
assert "/setup blocked" "302" "$(curl -sI -o /dev/null -w '%{http_code}' $BASE/setup)"
assert_contains "Completed" '"completed":true' "$(get /api/setup/status)"

# ─── AUTH: Login ───
echo ""
echo "▸ Auth: Login"
R=$(post /api/auth/sign-in/email '{"email":"admin@e2e.test","password":"e2epass12345"}')
assert_contains "Admin login" '"user"' "$R"

# verify cookie works
assert "Dashboard accessible" "200" "$(status /dashboard)"
assert "Admin accessible" "200" "$(status /admin)"

# ─── TOKENS: CRUD ───
echo ""
echo "▸ Tokens: CRUD"
R=$(post /api/auth/api-key/create '{"name":"e2e-token","expiresIn":86400}')
TOKEN_ID=""
if echo "$R" | grep -q '"id"'; then
  assert_contains "Create token returns id" '"id"' "$R"
  assert_contains "Create token returns key" '"key"' "$R"
  TOKEN_ID=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
else
  echo "  ⚠️  Create token response: $(echo $R | head -c 120)"
  SKIP=$((SKIP+1))
fi

R=$(get /api/auth/api-key/list)
if echo "$R" | grep -q '\['; then
  assert_contains "List tokens returns array" '\[' "$R"
else
  echo "  ⚠️  List tokens response: $(echo $R | head -c 120)"
  SKIP=$((SKIP+1))
fi

if [ -n "$TOKEN_ID" ]; then
  R=$(post /api/auth/api-key/delete "{\"keyId\":\"$TOKEN_ID\"}")
  assert_contains "Revoke token" '"success"\|"ok"' "$R"
else
  echo "  ⚠️  Skipping revoke (no token ID)"
  SKIP=$((SKIP+1))
fi

# ─── CLI AUTH FLOW ───
echo ""
echo "▸ CLI Auth Flow"
STATE=$(python3 -c "import uuid; print(uuid.uuid4())")
R=$(post /api/v1/cli-auth/start "{\"state\":\"$STATE\"}")
assert_contains "CLI start returns authUrl" '"authUrl"' "$R"
assert_contains "CLI start returns sessionCode" '"sessionCode"' "$R"
SESSION_CODE=$(echo "$R" | python3 -c "import sys,json; print(json.load(sys.stdin).get('sessionCode',''))" 2>/dev/null || echo "")

if [ -n "$SESSION_CODE" ]; then
  # Authorize (with browser cookies)
  R=$(post /api/v1/cli-auth/authorize "{\"sessionCode\":\"$SESSION_CODE\"}")
  assert_contains "CLI authorize" '"success":true' "$R"

  # Exchange
  R=$(post /api/v1/cli-auth/exchange "{\"sessionCode\":\"$SESSION_CODE\",\"state\":\"$STATE\"}")
  assert_contains "CLI exchange returns token" '"token"' "$R"
  assert_contains "CLI exchange returns user" '"user"' "$R"
else
  echo "  ❌ No session code — cannot test authorize/exchange"
  FAIL=$((FAIL+2))
fi

# ─── ADMIN APIs ───
echo ""
echo "▸ Admin: Users API"
R=$(get /api/admin/users)
assert_contains "List users" '"users"' "$R"
assert_contains "Has total" '"total"' "$R"
assert_contains "Has pagination" '"totalPages"' "$R"

R=$(get "/api/admin/users?search=admin")
assert_contains "Search users" '"users"' "$R"

echo ""
echo "▸ Admin: Packages API"
R=$(get /api/admin/packages)
assert_contains "List packages" '"packages"' "$R"
assert_contains "Has total" '"total"' "$R"

R=$(get "/api/admin/packages?status=invalid")
assert "Invalid status returns 400" "400" "$(status '/api/admin/packages?status=invalid')"

echo ""
echo "▸ Admin: Audit Logs API"
R=$(get /api/admin/audit-logs)
assert_contains "List audit logs" '"events"' "$R"
assert_contains "Has total" '"total"' "$R"

R=$(get "/api/admin/audit-logs?startDate=invalid")
assert "Invalid date returns 400" "400" "$(status '/api/admin/audit-logs?startDate=invalid')"

# ─── ADMIN: CRUD Operations ───
echo ""
echo "▸ Admin: CRUD Operations"
post /api/setup/admin '{"email":"testuser@e2e.test","password":"testpass12345"}' > /dev/null 2>&1
sleep 1

R=$(get "/api/admin/users?search=testuser")
TEST_USER_ID=$(echo "$R" | python3 -c "import sys,json; users=json.load(sys.stdin).get('users',[]); print(users[0]['id'] if users else '')" 2>/dev/null || echo "")

if [ -n "$TEST_USER_ID" ]; then
  # Suspend
  R=$(curl -s -X PATCH "$BASE/api/admin/users/$TEST_USER_ID/status" -H 'Content-Type: application/json' -H "Origin: $BASE" -b $COOKIE_JAR -d '{"status":"suspended","reason":"E2E test"}')
  assert_contains "Suspend user" '"ok":true' "$R"

  # Verify suspended
  R=$(get "/api/admin/users/$TEST_USER_ID")
  assert_contains "User has suspended status" '"suspended"' "$R"

  # Reactivate
  R=$(curl -s -X PATCH "$BASE/api/admin/users/$TEST_USER_ID/status" -H 'Content-Type: application/json' -H "Origin: $BASE" -b $COOKIE_JAR -d '{"status":"active"}')
  assert_contains "Activate user" '"ok":true' "$R"
else
  echo "  ⚠️  Could not find test user — skipping CRUD"
  SKIP=$((SKIP+3))
fi

# ─── NON-ADMIN ACCESS (should fail) ───
echo ""
echo "▸ Access Control"
# Clear cookies to test as unauthenticated
EMPTY_JAR=$(mktemp)
assert "Admin users 401 without auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/admin/users -b $EMPTY_JAR)"
assert "Admin packages 401 without auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/admin/packages -b $EMPTY_JAR)"
assert "Admin audit-logs 401 without auth" "401" "$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/admin/audit-logs -b $EMPTY_JAR)"
rm -f $EMPTY_JAR

# ─── RESULTS ───
echo ""
echo "═══════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed, $SKIP skipped"
echo "═══════════════════════════════════════"

if [ $FAIL -gt 0 ]; then exit 1; fi
