# teex

A lightweight desktop app for previewing and editing Markdown and text files during agentic workflows. Designed as a companion to AI tools like Claude Code — agents open files in teex so you can review, edit, and approve without leaving your flow.

## What it does

- **Markdown preview** — renders `.md` files with a toggle between preview and raw edit mode (`Cmd+E`)
- **Tabbed editing** — open multiple files in one window, switch between tabs, close individually
- **Folder mode** — open a directory to browse and navigate all text files via a sidebar
- **Auto-save** — changes save automatically after a short delay and on `Cmd+S`
- **CLI-first** — designed to be launched by agents or scripts, not just humans

## Usage

```bash
# Open a single file
teex path/to/file.md

# Open multiple files in tabs
teex file1.md file2.md file3.md

# Open a folder with sidebar navigation
teex /path/to/folder

# Install the agent skill files
teex install-skill
```

## Agent integration

teex ships with a skill file (`skills/teex.md`) that teaches Claude Code and Codex when and how to use it. Run `teex install-skill` to copy the skill into your agent's skill directory so it gets picked up automatically.

Once installed, agents will open plans, drafts, and generated files in teex before asking for your review — giving you a focused editing environment instead of inline chat output.

## Development

Built with [Tauri 2](https://tauri.app) (Rust backend, vanilla JS/HTML/CSS frontend).

```bash
# Run in development mode
cargo tauri dev

# Build a distributable
cargo tauri build

# Validate Rust backend
cargo check
cargo clippy --all-targets --all-features
```

Prerequisites: Rust toolchain + Tauri CLI + platform WebView dependencies.

## License

See [LICENSE](LICENSE).
