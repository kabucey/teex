import { escapeAttr, escapeHtml } from "../ui/html-utils.js";
import { baseName } from "../utils/app-utils.js";
import { canGoBack, canGoForward } from "./navigation.js";
import { buildTabDisambiguations } from "./tab-disambiguation.js";
import { bindTabDragEvents } from "./tab-drag-handler.js";

export function buildTabBarHtml(state) {
  const disambiguations = buildTabDisambiguations(state.openFiles);
  let html = "";

  if (state.openFiles.length === 0 && state.activePath) {
    const label = baseName(state.activePath);
    const tooltip = state.activePath;
    html += `<div class="tab tab-active" data-index="0">`;
    html += `<button class="tab-close" data-index="0" title="Close" aria-label="Close ${escapeAttr(label)}">×</button>`;
    html += `<span class="tab-label" title="${escapeAttr(tooltip)}">${escapeHtml(label)}</span>`;
    if (state.isDirty) {
      html += `<span class="tab-dirty">●</span>`;
    }
    html += `<span class="tab-shortcut" aria-hidden="true">⌘1</span>`;
    html += "</div>";
  }

  for (let i = 0; i < state.openFiles.length; i += 1) {
    const tab = state.openFiles[i];
    const isActive = i === state.activeTabIndex;
    const isDirty = isActive ? state.isDirty : tab.isDirty;
    const label = tab.path
      ? baseName(tab.path)
      : tab.kind === "diff"
        ? "Changes"
        : "Untitled";
    const tooltip = tab.path || label;
    html += `<div class="tab${isActive ? " tab-active" : ""}" data-index="${i}">`;
    html += `<button class="tab-close" data-index="${i}" title="Close" aria-label="Close ${escapeAttr(label)}">×</button>`;
    const folder = disambiguations.get(i);
    html += `<span class="tab-label" title="${escapeAttr(tooltip)}">${escapeHtml(label)}${folder ? `<span class="tab-folder">${escapeHtml(folder)}</span>` : ""}</span>`;
    if (isDirty) {
      html += `<span class="tab-dirty">●</span>`;
    }
    if (i < 9) {
      html += `<span class="tab-shortcut" aria-hidden="true">⌘${i + 1}</span>`;
    }
    html += "</div>";
  }

  return html;
}

export function updateNavButtons(state, el) {
  const navState =
    state.openFiles.length > 0
      ? state.openFiles[state.activeTabIndex] || state
      : state;

  if (el.navBack) {
    el.navBack.disabled = !canGoBack(navState);
  }
  if (el.navForward) {
    el.navForward.disabled = !canGoForward(navState);
  }
}

export function bindTabBarEvents({
  el,
  state,
  invoke,
  switchTab,
  moveTab,
  closeTab,
  closeActiveFileOrWindow,
  crossWindowDrag,
}) {
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
      if (state.openFiles.length === 0) {
        await closeActiveFileOrWindow();
      } else {
        await closeTab(index);
      }
    });
  });

  bindTabDragEvents({ el, moveTab, crossWindowDrag });

  el.tabBar.querySelectorAll(".tab").forEach((tabEl) => {
    tabEl.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const index = parseInt(tabEl.dataset.index, 10);
      invoke("show_tab_context_menu", { index });
    });
  });
}
