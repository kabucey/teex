# Teex

Teex is a desktop review workspace for agentic workflows, built for reviewing Markdown, code, and Git-backed changes in a focused UI.

## What it does

- **Markdown review** — renders `.md` files with preview and raw edit mode (`Cmd+E`), Mermaid diagrams, and interactive task lists
- **Code review with syntax highlighting** — language-aware highlighting for 70+ file types via CodeMirror, with bracket matching and line numbers
- **Git status + diff review** — inspect changed files and diffs inline, or view all changes in a unified diff (`Cmd+Shift+G`)
- **Tabbed review sessions** — open multiple files in one window, switch between tabs, drag tabs between windows
- **Folder mode** — open a directory to browse and navigate project files via a sidebar with Git status indicators
- **Auto-save** — changes save automatically after a short delay and on `Cmd+S`
- **Find in file** — search with regex support and match highlighting across editor and preview (`Cmd+F`)
- **Smart paste** — detects and auto-formats JSON, YAML, TOML, XML, and CSV pasted into matching file types
- **Session restore** — reopen all tabs from your last session (`Cmd+Shift+R`)
- **Multi-window** — open multiple windows, merge all into one with "Merge All Windows"
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

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+E` | Toggle Markdown edit/preview |
| `Cmd+S` | Save now |
| `Cmd+F` | Find in file |
| `Cmd+1`–`Cmd+9` | Jump to tab by number |
| `Cmd+\` | Toggle sidebar |
| `Cmd+/` | Toggle status bar |
| `Cmd+[` / `Cmd+]` | Navigate back / forward |
| `Cmd+Shift+G` | Unified diff of all changes |
| `Cmd+Shift+M` | Filter to modified files only |
| `Cmd+Shift+E` | Expand/collapse all folders |
| `Cmd+Shift+.` | Show/hide hidden files |
| `Cmd+Shift+R` | Restore last session |

## macOS integration

- **Services menu** — "New Teex Tab Here" and "New Teex Window Here" from Finder right-click
- **Default Markdown handler** — set via the app menu
- **CLI install** — "Install Command Line Tool" adds `teex` to `/usr/local/bin`

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
