#!/usr/bin/env bash
# Check that all package version fields are identical across the monorepo.
# Covers: package.json (npm), Chart.yaml (Helm), pyproject.toml (PyPI),
# Cargo.toml (Rust), and _version.py (tank-sdk single source).

set -euo pipefail

declare -a FILES=(
  "packages/cli/package.json"
  "apps/registry/package.json"
  "packages/mcp-server/package.json"
  "packages/internals-schemas/package.json"
  "packages/internals-helpers/package.json"
  "packages/sdk/package.json"
  "infra/helm/tank/Chart.yaml"
  "packages/sdk-python/pyproject.toml"
  "packages/sdk-python/tankpkg/_version.py"
  "packages/sdk-core/crates/python/pyproject.toml"
  "packages/sdk-core/crates/python/Cargo.toml"
)

extract_version() {
  local file=$1
  case "$file" in
    *.json)
      jq -r '.version' "$file"
      ;;
    *Chart.yaml)
      grep "^appVersion:" "$file" | sed 's/appVersion: "\(.*\)"/\1/' | tr -d ' '
      ;;
    */sdk-python/pyproject.toml)
      if grep -qE '^dynamic\s*=\s*\[.*"version"' "$file"; then
        echo "dynamic"
      else
        grep "^version" "$file" | head -1 | sed 's/version = "\(.*\)"/\1/' | tr -d ' '
      fi
      ;;
    *_version.py)
      grep "^__version__" "$file" | sed 's/__version__ = "\(.*\)"/\1/'
      ;;
    *pyproject.toml|*Cargo.toml)
      grep "^version" "$file" | head -1 | sed 's/version = "\(.*\)"/\1/' | tr -d ' '
      ;;
  esac
}

versions=()
first_version=""
all_match=true

for file in "${FILES[@]}"; do
  version=$(extract_version "$file" || echo "")
  if [[ -z "$version" ]]; then
    echo "Failed to extract version from $file"
    exit 1
  fi

  # sdk-python/pyproject.toml is dynamic (reads from _version.py) — skip comparison
  if [[ "$version" == "dynamic" ]]; then
    versions+=("$file:dynamic (reads _version.py)")
    continue
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
  # Also verify the tank-sdk [native] extra pins the matching tank-core version
  native_pin=$(grep '^native = \["tank-core==' packages/sdk-python/pyproject.toml | sed 's/native = \["tank-core==\(.*\)"\]/\1/')
  if [[ -z "$native_pin" ]]; then
    echo "Failed to extract [native] pin from packages/sdk-python/pyproject.toml"
    exit 1
  fi
  if [[ "$native_pin" != "$first_version" ]]; then
    echo "Version mismatch: tank-sdk [native] pins tank-core==$native_pin (expected $first_version)"
    exit 1
  fi
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
