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
  mapfile -t node_tests < <(find tests -type f -name "*.test.mjs" | sort)
  node --test "${node_tests[@]}"
)

echo "All tests passed."
