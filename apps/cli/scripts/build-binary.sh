#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="$ROOT_DIR/build"
INPUT_FILE="$BUILD_DIR/tank-bundle.mjs"
TARGET="${TARGET:-}"
OUTPUT_NAME="${OUTPUT_NAME:-}"

if [ ! -f "$INPUT_FILE" ]; then
  echo "Missing bundle at $INPUT_FILE"
  echo "Run: pnpm run build:bundle"
  exit 1
fi

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH_RAW="$(uname -m)"

case "$ARCH_RAW" in
  x86_64)
    ARCH="x64"
    ;;
  arm64|aarch64)
    ARCH="arm64"
    ;;
  *)
    echo "Unsupported architecture: $ARCH_RAW"
    exit 1
    ;;
esac

case "$OS" in
  darwin|linux)
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

OUTPUT="$BUILD_DIR/tank-${OS}-${ARCH}"
if [ -n "$OUTPUT_NAME" ]; then
  OUTPUT="$BUILD_DIR/$OUTPUT_NAME"
fi

echo "Compiling standalone binary: $OUTPUT"
if [ -n "$TARGET" ]; then
  bun build --compile "$INPUT_FILE" --target "$TARGET" --outfile "$OUTPUT"
else
  bun build --compile "$INPUT_FILE" --outfile "$OUTPUT"
fi
chmod +x "$OUTPUT"

echo "Binary size:"
ls -lh "$OUTPUT"

echo "Smoke test:"
"$OUTPUT" --version
