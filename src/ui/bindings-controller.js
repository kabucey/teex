import { saveSidebarWidth } from "../app/sidebar-width-persistence.js";
import { clamp, selectAllContents } from "../app-utils.js";
import { hasFileDragData } from "../path-input.js";
import { renderMarkdown } from "./markdown-renderer.js";
import {
  detectStructuredPasteKind,
  formatStructuredPasteText,
} from "./paste-format.js";
import { insertFormattedPaste } from "./paste-insert.js";
import { showToast } from "./toast.js";

export function bindElements(el) {
  el.workspace = document.querySelector("#workspace");
  el.sidebar = document.querySelector("#sidebar");
  el.sidebarResizer = document.querySelector("#sidebar-resizer");
  el.dropOverlay = document.querySelector("#drop-overlay");
  el.projectRootLabel = document.querySelector("#project-root-label");
  el.projectList = document.querySelector("#project-list");
  el.collapseToggleBtn = document.querySelector("#collapse-toggle-btn");
  el.tabBarRow = document.querySelector(".tab-bar-row");
  el.tabBar = document.querySelector("#tab-bar");
  el.navBack = document.querySelector("#nav-back");
  el.navForward = document.querySelector("#nav-forward");
  el.editorState = document.querySelector("#editor-state");
  el.editor = document.querySelector("#editor");
  el.editorBackdrop = document.querySelector("#editor-backdrop");
  el.codeEditor = document.querySelector("#code-editor");
  el.preview = document.querySelector("#preview");
  el.statusBar = document.querySelector("#status-bar");
  el.statusBarLines = document.querySelector("#status-bar-lines");
  el.findBar = document.querySelector("#find-bar");
  el.findInput = document.querySelector("#find-input");
  el.findCount = document.querySelector("#find-count");
  el.findPrev = document.querySelector("#find-prev");
  el.findNext = document.querySelector("#find-next");
  el.findClose = document.querySelector("#find-close");
}

export function bindUiEvents({
  state,
  el,
  invoke,
  setStatus,
  toggleMarkdownMode,
  toggleSidebarVisibility,
  toggleStatusBar,
  toggleCollapseAllFolders,
  expandAllFolders,
  saveNow,
  hasTabSession,
  switchTab,
  navigateBack,
  navigateForward,
  onEditorScroll,
  onPreviewScroll,
  onDirtyStateChanged,
  openFind,
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

  let pasteFormatting = false;

  el.editor.addEventListener("paste", async (event) => {
    const text = event.clipboardData?.getData("text/plain");
    if (!text || pasteFormatting) {
      return;
    }

    const detectedKind = detectStructuredPasteKind({
      activePath: state.activePath,
      text,
    });
    if (!detectedKind) {
      return;
    }

    event.preventDefault();
    pasteFormatting = true;

    try {
      const formatResult = await formatStructuredPasteText({
        invoke,
        text,
        activePath: state.activePath,
      });

      const { inserted } = await insertFormattedPaste(
        el.editor,
        text,
        formatResult?.formatted || null,
      );

      if (inserted === "formatted") {
        const kindLabel = (
          formatResult.detectedKind || detectedKind
        ).toUpperCase();
        showToast(`Reformatted as ${kindLabel}`);
      } else if (!formatResult?.detectedKind) {
        setStatus(
          `Unable to auto-format pasted ${detectedKind.toUpperCase()} (invalid syntax)`,
          true,
        );
      }
    } finally {
      pasteFormatting = false;
    }
  });

  el.editor.addEventListener("input", (event) => {
    state.content = event.target.value;
    state.isDirty = state.content !== state.savedContent;
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
    if (event.metaKey && event.key.toLowerCase() === "f") {
      event.preventDefault();
      if (typeof openFind === "function") {
        openFind();
      }
      return;
    }

    if (event.metaKey && event.key.toLowerCase() === "a") {
      const isCodeEditorVisible =
        el.codeEditor && !el.codeEditor.classList.contains("hidden");
      if (isCodeEditorVisible) {
        event.preventDefault();
        selectAllContents(el.codeEditor);
        return;
      }

      const isPreviewVisible = !el.preview.classList.contains("hidden");
      if (isPreviewVisible) {
        event.preventDefault();
        selectAllContents(el.preview);
        return;
      }

      const isEditorVisible = !el.editor.classList.contains("hidden");
      if (isEditorVisible && document.activeElement !== el.editor) {
        event.preventDefault();
        el.editor.focus();
        el.editor.select();
        return;
      }
    }

    if (event.metaKey && event.key.toLowerCase() === "e") {
      event.preventDefault();
      toggleMarkdownMode();
    }

    if (event.metaKey && event.key === "/") {
      event.preventDefault();
      toggleStatusBar();
    }

    if (event.metaKey && event.shiftKey && event.code === "Backslash") {
      event.preventDefault();
      toggleCollapseAllFolders();
      return;
    }

    if (event.metaKey && event.code === "Backslash") {
      event.preventDefault();
      toggleSidebarVisibility();
    }

    if (event.metaKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      await saveNow();
    }

    if (event.metaKey && event.key === "[") {
      event.preventDefault();
      if (typeof navigateBack === "function") {
        navigateBack();
      }
      return;
    }

    if (event.metaKey && event.key === "]") {
      event.preventDefault();
      if (typeof navigateForward === "function") {
        navigateForward();
      }
      return;
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
    const checkbox = event.target.closest(
      'input[type="checkbox"], .task-list-item-checkbox',
    );
    if (checkbox) {
      const listItem = checkbox.closest("li[data-src-line]");
      const srcLine = parseInt(listItem?.dataset?.srcLine, 10);
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

  {
    const LONG_PRESS_MS = 400;
    let pressTimer = null;
    let didLongPress = false;

    el.collapseToggleBtn.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      didLongPress = false;
      pressTimer = setTimeout(() => {
        didLongPress = true;
        pressTimer = null;
        expandAllFolders();
      }, LONG_PRESS_MS);
    });

    const cancelPress = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    el.collapseToggleBtn.addEventListener("pointerup", cancelPress);
    el.collapseToggleBtn.addEventListener("pointerleave", cancelPress);
    el.collapseToggleBtn.addEventListener("pointercancel", cancelPress);

    el.collapseToggleBtn.addEventListener("click", () => {
      if (didLongPress) return;
      toggleCollapseAllFolders();
    });
  }

  el.navBack.addEventListener("click", () => {
    if (typeof navigateBack === "function") {
      navigateBack();
    }
  });

  el.navForward.addEventListener("click", () => {
    if (typeof navigateForward === "function") {
      navigateForward();
    }
  });

  el.projectRootLabel.addEventListener("dblclick", async (event) => {
    if (state.mode !== "folder" || !state.rootPath) {
      return;
    }

    event.preventDefault();
    await invoke("open_in_file_manager", { path: state.rootPath }).catch(
      (error) => {
        setStatus(String(error), true);
      },
    );
  });

  window.addEventListener("focus", () => {
    invoke("notify_window_focused").catch(() => {});
  });

  window.addEventListener(
    "pointerdown",
    () => {
      invoke("notify_window_focused").catch(() => {});
    },
    { capture: true },
  );

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
      el.workspace.style.setProperty(
        "--sidebar-width",
        `${state.sidebarWidth}px`,
      );
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      saveSidebarWidth(state.sidebarWidth);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
}
