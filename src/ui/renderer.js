import { renderMarkdown } from "./markdown-renderer.js";
import { baseName } from "../app-utils.js";
import { escapeAttr, escapeHtml } from "./html-utils.js";

export function createUiRenderer({
  state,
  el,
  invoke,
  renderSidebar,
  switchTab,
  closeTab,
}) {
  function syncWindowTitle() {
    const nextRepresentedPath =
      state.mode === "folder" ? (state.rootPath || null) : (state.activePath || null);
    const nextTitle = nextRepresentedPath ? baseName(nextRepresentedPath) : "Teex";

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
    const show = state.openFiles.length >= 2;
    el.tabBar.classList.toggle("hidden", !show);

    if (!show) {
      el.tabBar.innerHTML = "";
      return;
    }

    let html = "";
    for (let i = 0; i < state.openFiles.length; i += 1) {
      const tab = state.openFiles[i];
      const isActive = i === state.activeTabIndex;
      const isDirty = isActive ? state.isDirty : tab.isDirty;
      const label = baseName(tab.path);
      html += `<div class="tab${isActive ? " tab-active" : ""}" data-index="${i}">`;
      html += `<button class="tab-close" data-index="${i}" title="Close" aria-label="Close ${escapeAttr(label)}">×</button>`;
      html += `<span class="tab-label" title="${escapeAttr(tab.path)}">${escapeHtml(label)}</span>`;
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
  }

  function renderMainPane() {
    const hasFile = Boolean(state.activePath);
    el.emptyState.classList.toggle("hidden", hasFile);
    el.editorState.classList.toggle("hidden", !hasFile);

    if (!hasFile) {
      return;
    }

    if (state.activeKind === "markdown" && state.markdownViewMode === "preview") {
      el.editor.classList.add("hidden");
      el.preview.classList.remove("hidden");
      el.preview.innerHTML = renderMarkdown(state.content);
      return;
    }

    el.preview.classList.add("hidden");
    el.editor.classList.remove("hidden");

    if (el.editor.value !== state.content) {
      el.editor.value = state.content;
    }
  }

  function render() {
    syncWindowTitle();
    renderTabBar();

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
    renderMainPane();
  }

  return {
    render,
  };
}
