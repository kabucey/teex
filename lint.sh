#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Running Rust lints (clippy)..."
(
  cd "$repo_root/src-tauri"
  cargo clippy --all-targets --all-features -- -D warnings
)

echo "Running JS/CSS lints (biome)..."
(
  cd "$repo_root"
  npm exec -- biome check src/ tests/
)

echo "All lints passed."
