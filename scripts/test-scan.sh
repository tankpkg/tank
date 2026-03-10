#!/bin/bash
# Test the security scanning API directly
# Usage: ./test-scan.sh [deploy-url]

set -e

DEPLOY_URL="${1:-http://localhost:8000}"
TEMP_DIR=$(mktemp -d)
TARBALL_PATH="$TEMP_DIR/test-skill.tar.gz"

echo "=== Testing Security Scanning API ==="
echo "Target: $DEPLOY_URL"
echo ""

# Step 1: Create a test skill package
echo "1. Creating test skill package..."
mkdir -p "$TEMP_DIR/test-skill"
cat > "$TEMP_DIR/test-skill/SKILL.md" << 'EOF'
# Test Security Scanner

A simple test skill to verify the security scanning pipeline.

## What it does
- Reads files from the local project directory
- Makes API calls to api.github.com
- Runs shell commands for git operations

---
name: test-security-scanner
version: 1.0.0
description: Test skill for security scanning verification
author: test-user
EOF

# Step 2: Create tarball
echo "2. Creating tarball..."
cd "$TEMP_DIR/test-skill" && tar -czf "$TARBALL_PATH" .
echo "   Created: $TARBALL_PATH"

# Step 3: Test health endpoint
echo ""
echo "3. Testing health endpoint..."
curl -s -X POST "$DEPLOY_URL/api/analyze" | jq .

# Step 4: Test scan endpoint (requires signed URL, will fail without it)
echo ""
echo "4. Testing scan endpoint (expected to fail without valid tarball URL)..."
curl -s -X POST "$DEPLOY_URL/api/analyze/scan" \
  -H "Content-Type: application/json" \
  -d '{
    "tarball_url": "file://'"$TARBALL_PATH"'",
    "version_id": "test-123",
    "manifest": {"name": "test-skill", "version": "1.0.0"},
    "permissions": {}
  }' | jq .

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "=== Test Complete ==="
