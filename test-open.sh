#!/usr/bin/env bash
set -euo pipefail

FILE="${1:-}"
if [ -z "$FILE" ]; then
  echo "Usage: ./test-open.sh <file>"
  echo "Example: ./test-open.sh examples/file1.md"
  exit 1
fi

# Resolve to absolute path
FILE="$(cd "$(dirname "$FILE")" && pwd)/$(basename "$FILE")"

echo "==> Building debug build..."
cargo tauri build --debug

echo "==> Killing any running Teex instances..."
pkill -x teex 2>/dev/null || true
sleep 1

echo "==> Opening '$FILE' via macOS open (simulates Finder double-click)..."
open -a "$(pwd)/src-tauri/target/debug/bundle/macos/teex.app" "$FILE"

echo "==> Done. Check if the file opened in Teex."
