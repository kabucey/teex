import { renderMarkdown, renderMermaidDiagrams } from "./markdown-renderer.js";
import { baseName } from "../app-utils.js";
import { escapeAttr, escapeHtml } from "./html-utils.js";
import { shouldShowTabBar } from "./behavior.js";

export function createUiRenderer({
  state,
  el,
  invoke,
  renderSidebar,
  switchTab,
  moveTab,
  closeTab,
}) {
  function syncWindowTitle() {
    const { nextTitle, nextRepresentedPath } = buildWindowTitleState(state);

    if (
      nextTitle === state.windowTitle &&
      nextRepresentedPath === state.windowRepresentedPath
    ) {
      return;
    }

    state.windowTitle = nextTitle;
    state.windowRepresentedPath = nextRepresentedPath;
    document.title = nextTitle;
    invoke("set_window_title", {
      title: nextTitle,
      representedPath: nextRepresentedPath,
    }).catch((error) => {
      console.error(String(error));
    });
  }

  function renderTabBar() {
    const show = shouldShowTabBar(state.openFiles.length);
    el.tabBar.classList.toggle("hidden", !show);

    let html = "";
    for (let i = 0; i < state.openFiles.length; i += 1) {
      const tab = state.openFiles[i];
      const isActive = i === state.activeTabIndex;
      const isDirty = isActive ? state.isDirty : tab.isDirty;
      const label = tab.path ? baseName(tab.path) : "Untitled";
      const tooltip = tab.path || "Untitled";
      html += `<div class="tab${isActive ? " tab-active" : ""}" data-index="${i}">`;
      html += `<button class="tab-close" data-index="${i}" title="Close" aria-label="Close ${escapeAttr(label)}">×</button>`;
      html += `<span class="tab-label" title="${escapeAttr(tooltip)}">${escapeHtml(label)}</span>`;
      if (isDirty) {
        html += `<span class="tab-dirty">●</span>`;
      }
      if (i < 9) {
        html += `<span class="tab-shortcut" aria-hidden="true">⌘${i + 1}</span>`;
      }
      html += "</div>";
    }
    el.tabBar.innerHTML = html;

    el.tabBar.querySelectorAll(".tab").forEach((tabEl) => {
      tabEl.addEventListener("click", (event) => {
        if (event.target.closest(".tab-close")) {
          return;
        }
        const index = parseInt(tabEl.dataset.index, 10);
        switchTab(index);
      });
    });

    el.tabBar.querySelectorAll(".tab-close").forEach((btn) => {
      btn.addEventListener("click", async (event) => {
        event.stopPropagation();
        const index = parseInt(btn.dataset.index, 10);
        await closeTab(index);
      });
    });

    let dragState = null;

    function clearDropIndicators() {
      el.tabBar.querySelectorAll(".tab").forEach((t) => {
        t.classList.remove("tab-drag-over-left", "tab-drag-over-right");
      });
    }

    function updateDropIndicator(clientX) {
      clearDropIndicators();
      const tabs = el.tabBar.querySelectorAll(".tab");
      for (const t of tabs) {
        const rect = t.getBoundingClientRect();
        if (clientX >= rect.left && clientX < rect.right) {
          const midX = rect.left + rect.width / 2;
          t.classList.add(clientX < midX ? "tab-drag-over-left" : "tab-drag-over-right");
          break;
        }
      }
    }

    function createGhost(sourceEl, clientX, clientY) {
      const ghost = sourceEl.cloneNode(true);
      const rect = sourceEl.getBoundingClientRect();
      ghost.className = "tab tab-active tab-ghost";
      ghost.style.width = rect.width + "px";
      ghost.style.left = (clientX - rect.width / 2) + "px";
      ghost.style.top = rect.top + "px";
      document.body.appendChild(ghost);
      return ghost;
    }

    function finishDrag(clientX) {
      if (!dragState) {
        return;
      }
      const fromIndex = dragState.fromIndex;
      dragState.sourceEl.classList.remove("tab-dragging");
      if (dragState.ghost) {
        dragState.ghost.remove();
      }
      document.documentElement.classList.remove("tab-reordering");
      dragState = null;
      clearDropIndicators();
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);

      const tabs = el.tabBar.querySelectorAll(".tab");
      for (const t of tabs) {
        const rect = t.getBoundingClientRect();
        if (clientX >= rect.left && clientX < rect.right) {
          const toIndex = parseInt(t.dataset.index, 10);
          const midX = rect.left + rect.width / 2;
          let target = clientX < midX ? toIndex : toIndex + 1;
          if (target > fromIndex) {
            target -= 1;
          }
          if (fromIndex !== target) {
            moveTab(fromIndex, target);
          }
          return;
        }
      }
    }

    function onMouseMove(event) {
      if (!dragState) {
        return;
      }
      event.preventDefault();
      if (!dragState.dragging) {
        const dx = event.clientX - dragState.startX;
        if (Math.abs(dx) < 5) {
          return;
        }
        dragState.dragging = true;
        dragState.sourceEl.classList.add("tab-dragging");
        dragState.ghost = createGhost(dragState.sourceEl, event.clientX, event.clientY);
        document.documentElement.classList.add("tab-reordering");
      }
      if (dragState.ghost) {
        const rect = dragState.sourceEl.getBoundingClientRect();
        dragState.ghost.style.left = (event.clientX - rect.width / 2) + "px";
      }
      updateDropIndicator(event.clientX);
    }

    function onMouseUp(event) {
      if (!dragState) {
        return;
      }
      if (dragState.dragging) {
        finishDrag(event.clientX);
      } else {
        dragState = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      }
    }

    el.tabBar.querySelectorAll(".tab").forEach((tabEl) => {
      tabEl.addEventListener("mousedown", (event) => {
        if (event.button !== 0 || event.target.closest(".tab-close")) {
          return;
        }
        event.preventDefault();
        dragState = {
          fromIndex: parseInt(tabEl.dataset.index, 10),
          sourceEl: tabEl,
          startX: event.clientX,
          dragging: false,
          ghost: null,
        };
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      });
    });
  }

  function renderMainPane(options = {}) {
    const shouldFocusEditor = options.focusEditor !== false;
    if (state.activeKind === "markdown" && state.markdownViewMode === "preview") {
      el.editor.classList.add("hidden");
      el.preview.classList.remove("hidden");
      el.preview.innerHTML = renderMarkdown(state.content);
      renderMermaidDiagrams(el.preview).catch((error) => {
        console.error(String(error));
      });
      return;
    }

    el.preview.classList.add("hidden");
    el.editor.classList.remove("hidden");

    if (el.editor.value !== state.content) {
      el.editor.value = state.content;
    }

    if (shouldFocusEditor) {
      el.editor.focus();
    }
  }

  function renderChrome() {
    syncWindowTitle();
    renderTabBar();
  }

  function render(options = {}) {
    renderChrome();

    const showSidebar = state.mode === "folder" && state.sidebarVisible;
    el.workspace.className = showSidebar ? "workspace workspace-folder" : "workspace workspace-empty";
    el.sidebar.classList.toggle("hidden", !showSidebar);
    el.sidebarResizer.classList.toggle("hidden", !showSidebar);
    if (showSidebar) {
      el.workspace.style.setProperty("--sidebar-width", `${state.sidebarWidth}px`);
    } else {
      el.workspace.style.removeProperty("--sidebar-width");
    }

    renderSidebar();
    renderMainPane(options);
  }

  return {
    render,
    renderChrome,
  };
}

export function buildWindowTitleState(state) {
  const nextRepresentedPath =
    state.mode === "folder" ? (state.rootPath || null) : (state.activePath || null);
  const isUntitled = !state.activePath
    && state.openFiles.length > 0
    && state.openFiles[state.activeTabIndex]?.path === null;
  const baseTitle = isUntitled ? "Untitled" : (nextRepresentedPath ? baseName(nextRepresentedPath) : "Teex");
  const hasUnsavedChanges = state.isDirty && (Boolean(state.activePath) || isUntitled);
  const nextTitle = hasUnsavedChanges ? `${baseTitle}  ●` : baseTitle;

  return {
    nextTitle,
    nextRepresentedPath,
  };
}
