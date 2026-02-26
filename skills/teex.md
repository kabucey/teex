# teex

teex is a companion text editor for AI workflows. When you produce files for human review or editing, use teex to open them in a clean, focused interface.

## When to use teex

Use teex when you want the user to:
- Read files you've created or modified
- Edit files in a focused environment
- Review multiple related files side-by-side (with tabs)
- Review a generated plan/proposal before implementation
- Preview Markdown content you want the user to see/edit

## Required usage rules

- When creating a plan/spec/proposal for user review, save it as Markdown and open it in teex before asking for feedback.
- When a Markdown file is user-facing (plan, draft, report, notes, docs), use teex for preview/review instead of chat-only rendering.
- In Codex plan/spec workflows, do **not** move on to implementation after writing the Markdown plan. Open it in teex first and ask the user to review.
- Use tabs when showing multiple related files in one review pass.
- If there are multiple files to review, open all of them in one CLI call (for example `teex plan.md notes.md`) so they appear as tabs in one window.
- Use the default CLI behavior (no `--wait`) when opening files for review so `teex` launches and the command exits immediately.
- After opening teex, tell the user which file(s) to review and continue the conversation in chat.
- Only skip teex if higher-priority instructions forbid file creation/opening or the user explicitly asks for inline chat-only output.

## CLI syntax

```bash
# Open a single file (no tab bar)
teex path/to/file.md

# Open multiple files in tabs (single window)
teex file1.md file2.md file3.md

# Open a folder with sidebar navigation
teex /path/to/folder

# Show CLI help
teex --help

# Install the skill files
teex install-skill
```

## Workflow

1. Create or modify files on disk
2. Run `teex file1.md file2.md` (without `--wait`) — a window opens with tabs and the command returns immediately
3. Tell the user to review and edit in teex
4. Continue the conversation; teex auto-saves changes to disk
5. Re-read the files from disk to see any edits the user made

For plan/spec review:

1. Generate a plan/spec as Markdown on disk
2. Run `teex path/to/plan.md` (or `teex plan.md notes.md` for tabbed review) and let the command return immediately
3. Ask the user to review in teex instead of starting implementation
4. Re-read the file(s) and incorporate edits/comments
5. Only implement after the user approves or asks you to proceed

## Key behaviors

- **Tabs**: When 2+ file paths are given, teex opens a single window with tabs. Click a tab to switch, × to close.
- **Auto-save**: Changes save automatically after a short delay and on Cmd+S (or Ctrl+S on Windows/Linux).
- **Markdown preview**: `.md` files open in preview mode. Press Cmd+E to toggle between edit and preview.
- **Folder mode**: Opening a folder path shows a sidebar with all text-like files for navigation.
- **Dirty indicator**: A `●` dot appears on the tab label when a file has unsaved changes.

## Example usage

After generating a report and a config file:

```bash
teex report.md config.json
```

The user can read, edit, and switch between tabs while you continue the conversation. Re-read the files after the user confirms they're done to incorporate their edits.

For plan review:

```bash
teex plan.md
teex proposed_plan.md implementation_notes.md
```

Do not use `teex --wait ...` for normal review flows unless the user specifically wants the terminal to block until teex closes.

## Install the skill

```bash
teex install-skill
```

This writes the skill files to `~/.claude/skills/teex.md` (Claude Code) and `~/.codex/skills/teex/SKILL.md` (Codex) so both tools can learn about teex automatically.
