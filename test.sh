#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Running Rust tests (src-tauri)..."
(
  cd "$repo_root/src-tauri"
  cargo test
)

echo "Running frontend helper tests..."
(
  cd "$repo_root"
  node --test tests/ui-behavior.test.mjs
)

echo "All tests passed."
