import { selectAllContents } from "../utils/app-utils.js";
import { isTextInputActive } from "./behavior.js";

export function buildKeyboardShortcuts({
  openFind,
  formatActiveFile,
  toggleMarkdownMode,
  toggleStatusBar,
  toggleModifiedOnly,
  toggleUnifiedDiff,
  toggleCollapseAllFolders,
  toggleSidebarVisibility,
  saveNow,
  navigateBack,
  navigateForward,
}) {
  return [
    {
      key: "f",
      meta: true,
      handler: () => openFind?.(),
    },
    {
      key: "f",
      ctrl: true,
      handler: () => formatActiveFile?.(),
    },
    {
      key: "e",
      meta: true,
      handler: () => toggleMarkdownMode?.(),
    },
    {
      key: "/",
      meta: true,
      handler: () => toggleStatusBar?.(),
    },
    {
      key: "m",
      meta: true,
      shift: true,
      handler: () => toggleModifiedOnly?.(),
    },
    {
      key: "g",
      meta: true,
      shift: true,
      handler: () => toggleUnifiedDiff?.(),
    },
    {
      key: "e",
      meta: true,
      shift: true,
      handler: () => toggleCollapseAllFolders?.(),
    },
    {
      code: "Backslash",
      meta: true,
      handler: () => toggleSidebarVisibility?.(),
    },
    {
      key: "s",
      meta: true,
      handler: () => saveNow?.(),
    },
    {
      key: "[",
      meta: true,
      handler: () => navigateBack?.(),
    },
    {
      key: "]",
      meta: true,
      handler: () => navigateForward?.(),
    },
  ];
}

export function handleKeyboardShortcut(
  event,
  shortcuts,
  { el, state, hasTabSession, switchTab },
) {
  for (const shortcut of shortcuts) {
    const useCtrl = shortcut.ctrl === true;
    if (useCtrl ? !event.ctrlKey : !event.metaKey) continue;

    const shiftRequired = shortcut.shift === true;
    if (shiftRequired !== event.shiftKey) continue;

    const matchesKey = shortcut.code
      ? event.code === shortcut.code
      : event.key.toLowerCase() === shortcut.key;
    if (!matchesKey) continue;

    event.preventDefault();
    shortcut.handler();
    return true;
  }

  if (event.metaKey && event.key.toLowerCase() === "a") {
    if (isTextInputActive(document.activeElement)) return false;

    const isPreviewVisible = !el.preview.classList.contains("hidden");
    if (isPreviewVisible) {
      event.preventDefault();
      selectAllContents(el.preview);
      return true;
    }

    const isEditorVisible = !el.editor.classList.contains("hidden");
    if (isEditorVisible && document.activeElement !== el.editor) {
      event.preventDefault();
      el.editor.focus();
      el.editor.select();
      return true;
    }
  }

  if (event.metaKey && /^[1-9]$/.test(event.key)) {
    const index = parseInt(event.key, 10) - 1;
    if (hasTabSession?.() && index < state.openFiles.length) {
      event.preventDefault();
      switchTab?.(index);
      return true;
    }
  }

  return false;
}
