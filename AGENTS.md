# Repository Guidelines

## Project Structure & Module Organization
This repository is a Tauri 2 desktop app.

- `src/`: frontend assets and UI logic (`index.html`, `main.js`, `styles.css`)
- `src/ui/`: UI-focused modules (for example: renderer, markdown renderer, UI behavior helpers, HTML escaping helpers)
- `src/sidebar/`: sidebar-specific modules (for example: controller, tree building/rendering helpers)
- `src/app-utils.js`: shared frontend utility helpers (`baseName`, `clamp`)
- `src/assets/`: static images/icons used by the frontend
- `src-tauri/src/`: Rust backend (`main.rs`, `lib.rs`) and internal modules for Tauri commands/runtime wiring
- `src-tauri/tauri.conf.json`: Tauri app configuration (window, bundle, frontend path)
- `src-tauri/icons/`: bundled application icons
- `examples/`: sample files/content for local manual testing
- `skills/`: project-specific notes/docs (not runtime code)

## Quick Navigation (for agents)
- Prefer `rg --files` to list files quickly (repo-wide or within a subdirectory).
- Common targets:
  - `rg --files src | sort`: frontend files
  - `rg --files src-tauri/src | sort`: Rust backend source
  - `rg --files examples | sort`: manual test/sample content
  - `rg --files skills | sort`: project notes/docs
- Use `rg "pattern" <path>` to find symbols/strings before editing.
- This repo currently uses static frontend files (`src/index.html`, `src/main.js`, `src/styles.css`) rather than a JS bundler/project manifest at the repo root (no `package.json`).
- Common edit targets:
  - `src/main.js`: primary frontend app logic (UI state, tab management, drag/drop, Tauri event listeners/invokes)
  - `src/styles.css`: app styling/layout
  - `src/index.html`: app shell/DOM structure
  - `src-tauri/src/lib.rs`: backend entrypoint/shared state/constants and module wiring (keep small)
  - `src-tauri/src/main.rs`: Rust entrypoint/bootstrapping
  - `src-tauri/src/app_runtime.rs`: Tauri app builder/menu/setup/run wiring
  - `src-tauri/src/menu_events.rs`: menu event routing + window event emission helpers
  - `src-tauri/src/launch.rs`: launch/open-path categorization and pending-open queue handling
  - `src-tauri/src/files.rs`: project listing + text file IO commands
  - `src-tauri/src/watchers.rs`: folder/file watcher install/clear logic
  - `src-tauri/src/window_title.rs`: window title + macOS represented-path proxy icon handling
  - `src-tauri/src/tests/`: Rust unit tests split by feature area (`mod.rs` + per-area files)
  - `src-tauri/tauri.conf.json`: window settings, bundle metadata, file associations

## Build, Test, and Development Commands
Run Rust/Tauri commands from `src-tauri/` unless noted.

Prerequisites: Rust toolchain, Tauri CLI, and platform-specific Tauri/WebView build dependencies must be installed before running Tauri commands.

- `cargo check`: fast compile validation for Rust backend changes
- `cargo fmt`: format Rust code with `rustfmt`
- `cargo clippy --all-targets --all-features -D warnings`: lint Rust code (use a non-`-D warnings` variant if the repo is mid-refactor)
- `cargo test`: run Rust tests (currently minimal/no tests, but use this before PRs)
- `./test.sh` (repo root): run all automated tests (Rust + Node helper tests)
- `cargo tauri dev` (repo root or `src-tauri/`): launch the desktop app in development mode (requires Tauri CLI installed)
- `cargo tauri build`: produce a distributable desktop build
- `./test-open.sh` (repo root): project-specific manual test helper for opening files (if present/useful for current changes)

## Coding Style & Naming Conventions
- JavaScript/CSS use 2-space indentation (see `src/main.js`, `src/styles.css`).
- Rust uses standard `rustfmt` formatting (4-space indentation).
- Use `camelCase` for JS variables/functions and serialized payload fields.
- Use `SCREAMING_SNAKE_CASE` for JS/Rust constants (for event/menu IDs).
- Keep frontend DOM IDs and state keys descriptive (`tab-bar`, `activeTabIndex`).
- Keep files small: target roughly 200 lines per file when practical. If a file grows beyond that, consider refactoring into smaller modules/components/functions.
- Hard cap for new/refactored code: keep files within 200-300 lines. If a file exceeds ~300 lines, split it before adding more logic (exceptions only for generated files or third-party vendored code).
- Prefer feature folders under `src/` when splitting large files (`src/sidebar/...`, `src/ui/...`, etc.) instead of accumulating many peer files at `src/` root.
- Mirror the `src/` folder structure under `tests/` when adding Node tests (for example `src/ui/...` -> `tests/ui/...`, `src/sidebar/...` -> `tests/sidebar/...`).

## Testing Guidelines
- Use TDD for behavior changes and bug fixes when practical: write or update tests first (or in the same change before implementation code), then implement to make them pass.
- For any regression fix, add a regression test that would fail without the fix when the behavior can be covered by automated tests.
- No dedicated frontend test framework is configured yet; verify UI changes manually in `cargo tauri dev`.
- Frontend logic that can be isolated into pure helper functions should be extracted and covered with lightweight Node tests (for example `node --test`) before wiring into UI event handlers.
- Prefer `./test.sh` as the default pre-PR/local verification command so both Rust and frontend helper tests run together.
- When refactoring `src/main.js`, prefer low-risk extractions into `src/` modules first (pure renderers/helpers/path normalization/state-free logic), then add/expand Node tests for the extracted module in `tests/*.test.mjs`.
- Continue the folder pattern during `src/main.js` refactors: place sidebar logic in `src/sidebar/`, UI rendering/formatting logic in `src/ui/`, and keep each module under the 200-300 line cap.
- For large refactors, preserve behavior by splitting into small phases and running `./test.sh` after each phase.
- Add Rust unit tests near backend logic in `src-tauri/src/` when changing file IO, path handling, or command behavior.
- For larger Rust backends, prefer a `src-tauri/src/tests/` folder with `mod.rs` + focused test modules (`launch.rs`, `files.rs`, etc.) over a single `tests.rs`.
- In `src-tauri/src/tests/`, do not add redundant `_tests` suffixes to filenames (use `launch.rs`, not `launch_tests.rs`).
- Prefer small, focused tests and cover error paths (missing file, invalid folder, read/write failures).
- When changing file-open flows or app registration behavior, manually test representative file types configured in `src-tauri/tauri.conf.json` (for example: Markdown, text, JSON, YAML, TOML, CSV, XML).
- If the feature touches file opening/launch behavior, test multiple entry paths when supported:
  - opening from the app UI
  - OS “Open With” / double-click file association
  - drag and drop into the app window

## Commit & Pull Request Guidelines
- Current history uses short, imperative summaries (examples: `Styling`, `Fonts`, `Added tabs...`).
- Keep commits focused and descriptive; use sentence case and mention the user-visible change.
- PRs should include: purpose, key changes, manual test steps, and screenshots/GIFs for UI updates.
- Link related issues/tasks when applicable and note any platform-specific limitations (macOS/Windows/Linux).
