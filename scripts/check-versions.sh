#!/usr/bin/env bash
# Check that all package.json version fields and Chart.yaml appVersion are identical
# Exit non-zero if versions differ

set -euo pipefail

# Files to check
declare -a FILES=(
  "packages/cli/package.json"
  "apps/web/package.json"
  "apps/web-astro/package.json"
  "apps/web-tanstack/package.json"
  "packages/mcp-server/package.json"
  "packages/internals-schemas/package.json"
  "packages/internals-helpers/package.json"
  "infra/helm/tank/Chart.yaml"
)

# Extract versions and check they all match
versions=()
first_version=""
all_match=true

for file in "${FILES[@]}"; do
  if [[ "$file" == *.json ]]; then
    version=$(jq -r '.version' "$file" 2>/dev/null || echo "")
    if [[ -z "$version" ]]; then
      echo "Failed to extract version from $file"
      exit 1
    fi
  else
    version=$(grep "^appVersion:" "$file" | sed 's/appVersion: "\(.*\)"/\1/' | tr -d ' ')
    if [[ -z "$version" ]]; then
      echo "Failed to extract appVersion from $file"
      exit 1
    fi
  fi

  versions+=("$file:$version")

  if [[ -z "$first_version" ]]; then
    first_version="$version"
  elif [[ "$version" != "$first_version" ]]; then
    all_match=false
    echo "Version mismatch: $file has version $version (expected $first_version)"
  fi
done

if [[ "$all_match" == true ]]; then
  echo "All versions match: $first_version"
  exit 0
else
  echo ""
  echo "Version summary:"
  for entry in "${versions[@]}"; do
    file=${entry%%:*}
    version=${entry#*:}
    echo "  $file: $version"
  done
  exit 1
fi
