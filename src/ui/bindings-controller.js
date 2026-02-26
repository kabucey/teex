import { clamp } from "../app-utils.js";
import { hasFileDragData } from "../path-input.js";

export function bindElements(el) {
  el.workspace = document.querySelector("#workspace");
  el.sidebar = document.querySelector("#sidebar");
  el.sidebarResizer = document.querySelector("#sidebar-resizer");
  el.dropOverlay = document.querySelector("#drop-overlay");
  el.projectRoot = document.querySelector("#project-root");
  el.projectList = document.querySelector("#project-list");
  el.tabBar = document.querySelector("#tab-bar");
  el.emptyState = document.querySelector("#empty-state");
  el.editorState = document.querySelector("#editor-state");
  el.editor = document.querySelector("#editor");
  el.preview = document.querySelector("#preview");
}

export function bindUiEvents({
  state,
  el,
  invoke,
  setStatus,
  scheduleAutosave,
  toggleMarkdownMode,
  toggleSidebarVisibility,
  saveNow,
  hasTabSession,
  switchTab,
  onEditorScroll,
  onPreviewScroll,
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

  el.editor.addEventListener("input", (event) => {
    state.content = event.target.value;
    state.isDirty = true;
    setStatus("Saving...");
    scheduleAutosave();
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
    const link = event.target.closest("a[href]");
    if (!link) {
      return;
    }
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noreferrer noopener");
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
