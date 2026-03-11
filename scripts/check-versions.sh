#!/usr/bin/env bash
# Check that all package.json version fields and Chart.yaml appVersion are identical
# Exit non-zero if versions differ

set -euo pipefail

# Files to check
declare -a FILES=(
  "packages/cli/package.json"
  "packages/web/package.json"
  "packages/mcp-server/package.json"
  "packages/shared/package.json"
  "infra/helm/tank/Chart.yaml"
)

# Extract versions
declare -A versions

# Extract from package.json files
for file in "${FILES[@]}"; do
  if [[ "$file" == *.json ]]; then
    version=$(jq -r '.version' "$file" 2>/dev/null || echo "")
    if [[ -z "$version" ]]; then
      echo "❌ Failed to extract version from $file"
      exit 1
    fi
    versions["$file"]="$version"
  fi
done

# Extract from Chart.yaml
chart_file="infra/helm/tank/Chart.yaml"
chart_version=$(grep "^appVersion:" "$chart_file" | sed 's/appVersion: "\(.*\)"/\1/' | tr -d ' ')
if [[ -z "$chart_version" ]]; then
  echo "❌ Failed to extract appVersion from $chart_file"
  exit 1
fi
versions["$chart_file"]="$chart_version"

# Check all versions match
first_version=""
all_match=true

for file in "${!versions[@]}"; do
  version="${versions[$file]}"
  if [[ -z "$first_version" ]]; then
    first_version="$version"
  elif [[ "$version" != "$first_version" ]]; then
    all_match=false
    echo "❌ Version mismatch: $file has version $version (expected $first_version)"
  fi
done

if [[ "$all_match" == true ]]; then
  echo "✓ All versions match: $first_version"
  exit 0
else
  echo ""
  echo "Version summary:"
  for file in "${!versions[@]}"; do
    echo "  $file: ${versions[$file]}"
  done
  exit 1
fi
