# teex Window Merge UX Spec (2 Windows -> 1 Window with Tabs)

## Goal

Let users combine files from multiple teex windows into a single tabbed window with minimal friction, while preserving unsaved in-memory edits.

## Recommended UX (Primary + Fallback)

### Primary: Drag a tab into another window

1. User drags a tab from Window A.
2. User hovers Window B.
3. Window B shows a tab insertion indicator in the tab bar.
4. User drops.
5. Window B inserts the tab and focuses it.
6. Window A removes the tab.
7. If Window A becomes truly empty (no folder context, no open file), it closes automatically.

### Fallback: Menu / command-driven merge

Use this as a first shipping path (reliable) and permanent accessibility fallback.

- `Window > Merge All Windows Into This Window`
- `Window > Move Active Tab To > [Other Window Title...]`
- `Window > Move Active Tab To > New Window` (optional parity feature)
- Command palette equivalents (if/when palette exists)

## Why this fits teex

- teex already has multi-file tabs (`state.openFiles`, `state.activeTabIndex`) in `src/main.js`.
- teex already routes window-specific events using window labels in `src-tauri/src/lib.rs`.
- teex already tracks focused windows (`notify_window_focused`) and can target the active window from menu actions.

## UX Details

### Drag source affordance

- Tab cursor changes to drag/grab state on mousedown + move threshold.
- Drag preview uses the tab label (filename) and dirty dot if unsaved.
- If a window only has one file and the tab bar is hidden, provide a draggable file chip in the header area (or make the title strip/file name pill draggable).

### Drop target affordance

- Hovering over a valid target window highlights the tab bar.
- Show a vertical insertion caret between tabs.
- If target window has 0 tabs, show a full-width drop target in the top strip: `Drop to add tab`.
- If target window is in folder mode with no tabs, the drop still inserts a tab and keeps the sidebar/project context unchanged.

### Post-drop behavior

- Focus the moved tab in the target window.
- Preserve tab content exactly (including unsaved text, markdown mode, dirty state).
- Preserve tab order in target based on drop position.
- Announce via status text:
  - Source: `Moved <file> to <window>`
  - Target: `Added <file> from <window>`

## Duplicate File Handling

Default behavior should avoid silently creating duplicate tabs for the same file path in the same window.

### Safe default rules

- If target window already has the same file path open and source tab is not dirty:
  - Focus existing tab in target.
  - Close source tab.
- If target already has the same file path and source tab is dirty:
  - Show conflict prompt (or cancel with status in v1).

### v1 (simpler) conflict behavior

- Cancel merge and show:
  - `Can't merge: <file> is already open in target window with unsaved state risk`
- User can save/close one tab and retry.

### v2 (better) conflict dialog

- `Focus Existing`
- `Keep Both Tabs`
- `Replace Target With Source` (dangerous; only if explicitly chosen)
- `Cancel`

## Auto-close Rules for Source Window

Close source window only when all are true:

- No remaining open tabs
- Not in folder mode with a sidebar/root folder still open
- No modal/dialog interaction in progress

Do not close a source window that is serving as a project sidebar (folder mode) after moving its last tab.

## Keyboard / Accessibility

- Menu actions must fully support merge/move without drag.
- Tab move operations should be exposed to screen readers via clear menu labels.
- After move, keyboard focus lands in the target editor/preview content for the moved tab.
- Keep existing tab shortcuts (`Cmd/Ctrl+1..9`) working after insertion/reorder.

## teex-Specific Interaction Spec

### New menu items (Tauri)

Add a `Window` menu (or extend `File`) with:

- `Merge All Windows Into This Window`
- `Move Active Tab To` (dynamic submenu of other windows)

Recommended placement:

- macOS: top-level `Window` menu
- Windows/Linux: `File` or `Window` top-level (either is acceptable; consistency matters more)

### Dynamic submenu labels

Use user-facing labels like:

- `notes.md — teex`
- `Project (3 tabs)`
- `Untitled Window`

Include tab counts to reduce ambiguity.

### Window targeting rule

`This Window` means the frontmost/focused window, using existing focus tracking in backend (`target_window` + JS `notify_window_focused`).

## Data Transfer Requirements (Important)

Do not re-read from disk when moving a tab between windows.

Transfer the in-memory tab payload:

- `path`
- `content`
- `kind`
- `writable`
- `isDirty`
- `markdownViewMode`

Reason: current teex supports unsaved in-memory edits and autosave timing; disk may be stale at the moment of merge.

## Suggested Implementation Shape (fits current code)

### Frontend (`src/main.js`)

Add:

- Per-tab stable `id` (not just array index) for drag/move operations
- `serializeTab(tab)` / `insertTransferredTab(...)`
- `removeTabById(...)`
- `moveActiveTabToWindow(targetWindowLabel)`
- Optional drag state + drop indicators in `renderTabBar()`

Extend event list with something like:

- `teex://request-tab-transfer`
- `teex://receive-tab-transfer`
- `teex://tab-transfer-result`

### Backend (`src-tauri/src/lib.rs`)

Add commands/events for:

- Listing open windows + metadata for dynamic `Move Active Tab To` submenu
- Routing a tab payload from source window to target window
- Returning accept/reject result to source (duplicate/conflict/cancel)
- `Merge All Windows Into This Window` orchestration (iterate other windows, ask each to transfer tabs)

The backend should stay transport/orchestration-only; tab conflict decisions can remain in the target frontend (which has local tab state).

## Shipping Plan (Pragmatic)

### Phase 1 (ship first)

- Menu-based merge/move only
- Preserve in-memory tab state during transfer
- Basic duplicate protection (cancel on dirty duplicate)
- Auto-close source window only when truly empty

This delivers the core outcome quickly and avoids cross-window drag complexity.

### Phase 2

- Drag tab between windows
- Tab insertion caret + hover highlights
- Single-tab draggable file chip/title strip

### Phase 3 (nice-to-have)

- Duplicate conflict dialog with options
- Reorder tabs by drag within a window (if not already planned)
- `Merge All Windows` preview/confirmation when many windows are open

## Edge Cases Checklist

- Source tab has unsaved edits (`isDirty = true`)
- Target already has same file open (clean/dirty variants)
- Source window is folder mode with one open tab
- Source window has multiple tabs and active tab is moved
- Target window currently empty
- Target window currently in folder mode
- Moving markdown tab preserves preview/edit mode
- Read-only file tab moves correctly (`writable = false`)
- Window closes while transfer is in flight (cancel safely)

## Success Criteria

- Merging windows never loses unsaved text.
- Users can complete merge without drag via menus.
- A single-file window can still be merged discoverably.
- Resulting focus and tab selection feel predictable.
