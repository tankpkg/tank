#!/usr/bin/env bash
set -euo pipefail

# Rewrite "workspace:*" in dependencies / optionalDependencies / peerDependencies
# to a concrete VERSION inside packages/$PKG/package.json.
#
# Usage: rewrite-workspace-deps.sh <pkg-dir> <version>
# Example: rewrite-workspace-deps.sh packages/cli 0.0.0-nightly.20260520.abc1234
#
# npm publish does NOT automatically rewrite workspace: protocol specs when run
# from a sub-directory (only from the workspace root). We do it explicitly to
# keep the published package.json semver-compatible for end-users.

PKG_DIR="${1:?pkg-dir required}"
VERSION="${2:?version required}"
PKG_JSON="${PKG_DIR}/package.json"

if [[ ! -f "${PKG_JSON}" ]]; then
  echo "rewrite-workspace-deps: ${PKG_JSON} not found" >&2
  exit 1
fi

jq --arg v "${VERSION}" '
  def rewrite(deps):
    if (deps | type) == "object"
      then (deps | with_entries(
        if (.value | type) == "string" and (.value | startswith("workspace:"))
          then .value = $v
          else .
        end
      ))
      else deps
    end;
  .dependencies = rewrite(.dependencies)
  | .optionalDependencies = rewrite(.optionalDependencies)
  | .peerDependencies = rewrite(.peerDependencies)
' "${PKG_JSON}" > "${PKG_JSON}.tmp" && mv "${PKG_JSON}.tmp" "${PKG_JSON}"

echo "rewrite-workspace-deps: ${PKG_JSON} dependencies pinned to ${VERSION}"
