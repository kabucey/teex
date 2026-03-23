# Teex

A desktop review workspace for agentic workflows. Teex started as a Markdown viewer, but it has evolved into a broader reviewing tool for Markdown, code, and Git-backed changes — so agents can hand work to a human in a focused UI instead of dumping everything into chat.

## What it does

- **Markdown review** — renders `.md` files with a toggle between preview and raw edit mode (`Cmd+E`)
- **Code review with syntax highlighting** — open code and config files with language-aware highlighting for fast inspection and editing
- **Git status + diff review** — inspect changed files and diffs without leaving the app
- **Tabbed review sessions** — open multiple files in one window, switch between tabs, close individually
- **Folder mode** — open a directory to browse and navigate project files via a sidebar
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

Teex ships with a skill file (`skills/teex.md`) that teaches Claude Code and Codex when and how to use it. Run `teex install-skill` to copy the skill into your agent's skill directory so it gets picked up automatically.

Once installed, agents will open plans, drafts, code files, and other generated artifacts in Teex before asking for your review — giving you a focused review environment with Markdown preview, syntax highlighting, and Git-aware inspection instead of inline chat output.

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
