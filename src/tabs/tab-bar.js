import { escapeAttr, escapeHtml } from "../ui/html-utils.js";
import { baseName, isCursorOutsideWindow } from "../utils/app-utils.js";
import { canGoBack, canGoForward } from "./navigation.js";
import { buildTabDisambiguations } from "./tab-disambiguation.js";

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
        t.classList.add(
          clientX < midX ? "tab-drag-over-left" : "tab-drag-over-right",
        );
        break;
      }
    }
  }

  function createGhost(sourceEl, clientX, _clientY) {
    const ghost = sourceEl.cloneNode(true);
    const rect = sourceEl.getBoundingClientRect();
    ghost.className = "tab tab-active tab-ghost";
    ghost.style.width = `${rect.width}px`;
    ghost.style.left = `${clientX - rect.width / 2}px`;
    ghost.style.top = `${rect.top}px`;
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
      dragState.ghost = createGhost(
        dragState.sourceEl,
        event.clientX,
        event.clientY,
      );
      document.documentElement.classList.add("tab-reordering");
      if (crossWindowDrag) {
        crossWindowDrag.activate(dragState.fromIndex);
      }
    }

    const outside = isCursorOutsideWindow(event.clientX, event.clientY);

    if (outside && crossWindowDrag) {
      clearDropIndicators();
      if (dragState.ghost) {
        dragState.ghost.classList.add("hidden");
      }
      crossWindowDrag.reportPosition(event.screenX, event.screenY);
      return;
    }

    if (!outside && crossWindowDrag) {
      crossWindowDrag.clearPreview();
    }

    if (dragState.ghost) {
      dragState.ghost.classList.remove("hidden");
      const rect = dragState.sourceEl.getBoundingClientRect();
      dragState.ghost.style.left = `${event.clientX - rect.width / 2}px`;
    }
    updateDropIndicator(event.clientX);
  }

  function cleanupDragUi() {
    if (dragState) {
      dragState.sourceEl.classList.remove("tab-dragging");
      if (dragState.ghost) {
        dragState.ghost.remove();
      }
    }
    document.documentElement.classList.remove("tab-reordering");
    dragState = null;
    clearDropIndicators();
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  function onMouseUp(event) {
    if (!dragState) {
      return;
    }
    if (dragState.dragging) {
      if (crossWindowDrag?.currentTargetLabel()) {
        cleanupDragUi();
        crossWindowDrag.completeDrop();
        return;
      }
      if (
        crossWindowDrag &&
        isCursorOutsideWindow(event.clientX, event.clientY)
      ) {
        cleanupDragUi();
        crossWindowDrag.completeDropAsNewWindow(event.screenX, event.screenY);
        return;
      }
      if (crossWindowDrag) {
        crossWindowDrag.cancel();
      }
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

    tabEl.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const index = parseInt(tabEl.dataset.index, 10);
      invoke("show_tab_context_menu", { index });
    });
  });
}
