# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

teex is a Tauri 2 desktop review tool for agentic workflows. It started as a Markdown viewer/editor, but now serves as a broader review workspace for Markdown files, code files with syntax highlighting, and Git status/diff inspection. Agents open files in teex for human review and editing. Built with a Rust backend and vanilla JS/HTML/CSS frontend (no bundler, no package.json).

## Build & Development Commands

All Rust/Tauri commands run from `src-tauri/` unless noted.

```bash
cargo tauri dev                # Launch in dev mode (from repo root or src-tauri/)
cargo tauri build              # Distributable build
cargo check                    # Fast Rust compile check
cargo fmt                      # Format Rust code
cargo clippy --all-targets --all-features -D warnings  # Lint Rust
```

## Testing

```bash
./test.sh                              # All tests (Rust + Node) — use before PRs
cd src-tauri && cargo test             # Rust tests only
node --test tests/**/*.test.mjs        # Node tests only
node --test tests/tabs/session.test.mjs  # Single test file
```

## Architecture

**Frontend** (`src/`): Vanilla ES6 modules, no build step. `index.html` loads `main.js` which wires up controllers.

**Backend** (`src-tauri/src/`): Rust with Tauri 2. `lib.rs` is the backend entrypoint; `app_runtime.rs` builds the Tauri app, menus, and event routing.

**IPC**: Frontend calls Rust via `invoke("command_name", { args })` and listens for events via `listen("teex://event-name", callback)`.

### Frontend patterns

- **State**: `src/app/runtime-state.js` — single centralized state factory
- **Controllers**: Feature-scoped factories (`createTabController()`, etc.) that receive dependencies via arguments — no globals
- **Renderers**: Pure functions for DOM updates (`src/ui/renderer.js`, `src/sidebar/tree.js`)
- **Bindings**: `src/ui/bindings-controller.js` wires DOM events to handlers

### Backend modules

- `files.rs` — file I/O commands
- `watchers.rs` — file/folder FS watching (debounced, emits events to frontend)
- `launch.rs` — path categorization and opening logic
- `menu_events.rs` — menu event routing
- `tab_transfer.rs` — multi-window tab merging protocol
- `apple_events.rs` / `mac_services.rs` — macOS-specific integrations

### Test structure

Node tests mirror `src/` layout: `src/ui/` → `tests/ui/`, `src/sidebar/` → `tests/sidebar/`. Rust tests live in `src-tauri/src/tests/` with per-feature modules (no `_tests` suffix).

## Coding Conventions

- **JS/CSS**: 2-space indent, `camelCase` vars/functions, `SCREAMING_SNAKE_CASE` constants
- **Rust**: `rustfmt` standard (4-space indent), `snake_case` functions, `PascalCase` types
- **File size**: Target ~200 lines, hard cap 300. Split into feature folders under `src/` (e.g., `src/sidebar/`, `src/ui/`)
- **Commit style**: Short imperative summaries, sentence case, mention user-visible change

## Key Development Notes

- **Prefer native UI over custom HTML/CSS** when a native equivalent exists and accomplishes the goal (e.g., use Tauri's native popup menus via `window.popup_menu()` instead of custom HTML context menus, native dialogs instead of custom modals)
- No JS bundler — frontend is static files served directly by Tauri (`src/index.html` is the entry)
- **TDD is required**: write or update tests before implementing. For every change, write a failing test first, then make it pass. Run `./test.sh` after each step to confirm.
- **After completing a feature**, run `./test.sh` and `./lint.sh` to verify everything passes before considering the work done.
- Extract pure helper functions from UI code and cover with Node tests before wiring into event handlers
- For large refactors, split into small phases and run `./test.sh` after each
- When changing file-open flows, manually test file types from `tauri.conf.json` (md, txt, json, yaml, toml, csv, xml) across entry paths: app UI, OS "Open With", and drag-drop

## Troubleshooting

- **Stale Rust build artifacts**: If `cargo check` fails with `E0463: can't find crate for ...` despite valid dependencies in `Cargo.toml`, run `cargo clean && cargo check` from `src-tauri/`. This clears corrupted/stale `.rmeta` files in the target directory.
- **Cargo cache warnings**: If you see "attempt to write a readonly database" for cache "last-use" tracking, check permissions on your Cargo home/cache directory. This doesn't block builds but may indicate permission issues.
