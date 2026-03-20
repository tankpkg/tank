#!/usr/bin/env bash
set -euo pipefail
echo "Node: $(node -v)"
echo "Bun: $(bun -v)"
echo "Python: $(python3 --version)"
echo "uv: $(uv --version)"
