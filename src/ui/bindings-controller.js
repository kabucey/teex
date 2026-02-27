import { clamp } from "../app-utils.js";
import { hasFileDragData } from "../path-input.js";
import { renderMarkdown } from "./markdown-renderer.js";

export function bindElements(el) {
  el.workspace = document.querySelector("#workspace");
  el.sidebar = document.querySelector("#sidebar");
  el.sidebarResizer = document.querySelector("#sidebar-resizer");
  el.dropOverlay = document.querySelector("#drop-overlay");
  el.projectRootLabel = document.querySelector("#project-root-label");
  el.projectList = document.querySelector("#project-list");
  el.tabBar = document.querySelector("#tab-bar");
  el.editorState = document.querySelector("#editor-state");
  el.editor = document.querySelector("#editor");
  el.preview = document.querySelector("#preview");
}

export function bindUiEvents({
  state,
  el,
  invoke,
  setStatus,
  toggleMarkdownMode,
  toggleSidebarVisibility,
  saveNow,
  hasTabSession,
  switchTab,
  onEditorScroll,
  onPreviewScroll,
  onDirtyStateChanged,
}) {
  window.addEventListener("dragover", (event) => {
    if (hasFileDragData(event)) {
      event.preventDefault();
    }
  });

  window.addEventListener("drop", (event) => {
    if (hasFileDragData(event)) {
      event.preventDefault();
    }
  });

  el.editor.addEventListener("paste", (event) => {
    const text = event.clipboardData?.getData("text/plain");
    if (!text) {
      return;
    }
    try {
      const parsed = JSON.parse(text);
      const formatted = JSON.stringify(parsed, null, 2);
      if (formatted === text) {
        return;
      }
      event.preventDefault();
      document.execCommand("insertText", false, formatted);
    } catch {
      // Not valid JSON — let default paste proceed.
    }
  });

  el.editor.addEventListener("input", (event) => {
    state.content = event.target.value;
    state.isDirty = true;
    if (typeof onDirtyStateChanged === "function") {
      onDirtyStateChanged();
    }
  });

  el.editor.addEventListener("scroll", () => {
    if (typeof onEditorScroll === "function") {
      onEditorScroll();
    }
  });

  el.preview.addEventListener("scroll", () => {
    if (typeof onPreviewScroll === "function") {
      onPreviewScroll();
    }
  });

  document.addEventListener("keydown", async (event) => {
    if (event.metaKey && event.key.toLowerCase() === "e") {
      event.preventDefault();
      toggleMarkdownMode();
    }

    if (event.metaKey && event.code === "Backslash") {
      event.preventDefault();
      toggleSidebarVisibility();
    }

    if (event.metaKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      await saveNow();
    }

    if (event.metaKey && /^[1-9]$/.test(event.key)) {
      const index = parseInt(event.key, 10) - 1;
      if (hasTabSession() && index < state.openFiles.length) {
        event.preventDefault();
        switchTab(index);
      }
    }
  });

  el.preview.addEventListener("click", (event) => {
    const checkbox = event.target.closest('input[type="checkbox"][data-src-line]');
    if (checkbox) {
      const srcLine = parseInt(checkbox.dataset.srcLine, 10);
      const lines = state.content.split("\n");
      const lineIndex = srcLine - 1;
      if (lineIndex >= 0 && lineIndex < lines.length) {
        const line = lines[lineIndex];
        if (/\[ \]/.test(line)) {
          lines[lineIndex] = line.replace("[ ]", "[x]");
        } else if (/\[[xX]\]/.test(line)) {
          lines[lineIndex] = line.replace(/\[[xX]\]/, "[ ]");
        }
        state.content = lines.join("\n");
        state.isDirty = true;
        if (typeof onDirtyStateChanged === "function") {
          onDirtyStateChanged();
        }
        if (state.activePath) {
          saveNow();
        }
        el.preview.innerHTML = renderMarkdown(state.content);
      }
      return;
    }

    const link = event.target.closest("a[href]");
    if (!link) {
      return;
    }
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noreferrer noopener");
  });

  el.projectRootLabel.addEventListener("dblclick", async (event) => {
    if (state.mode !== "folder" || !state.rootPath) {
      return;
    }

    event.preventDefault();
    await invoke("open_in_file_manager", { path: state.rootPath }).catch((error) => {
      setStatus(String(error), true);
    });
  });

  window.addEventListener("focus", () => {
    invoke("notify_window_focused").catch(() => {});
  });

  window.addEventListener("pointerdown", () => {
    invoke("notify_window_focused").catch(() => {});
  }, { capture: true });

  el.sidebarResizer.addEventListener("pointerdown", (event) => {
    if (state.mode !== "folder" || !state.sidebarVisible) {
      return;
    }

    event.preventDefault();
    const workspaceRect = el.workspace.getBoundingClientRect();

    const onMove = (moveEvent) => {
      const rawWidth = moveEvent.clientX - workspaceRect.left;
      const maxWidth = Math.max(220, Math.floor(workspaceRect.width * 0.65));
      state.sidebarWidth = clamp(rawWidth, 180, maxWidth);
      el.workspace.style.setProperty("--sidebar-width", `${state.sidebarWidth}px`);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
}
