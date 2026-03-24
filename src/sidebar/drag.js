import {
  flushStateToActiveTabInState,
  hasTabSession,
  normalizeTransferTab,
  snapshotActiveFileAsTransferTab,
  syncActiveTabToStateFromTabs,
} from "../tabs/session.js";
import { baseName, isCursorOutsideWindow } from "../utils/app-utils.js";

const DRAG_THRESHOLD = 5;

export function shouldStartSidebarDrag(dx, dy) {
  return Math.abs(dx) + Math.abs(dy) >= DRAG_THRESHOLD;
}

export function findOpenFileContent(openFiles, path) {
  const tab = openFiles.find((f) => f.path === path);
  if (!tab) {
    return null;
  }
  return tab.content ?? null;
}

export function isOverTabBar(tabBar, clientX, clientY) {
  if (tabBar.classList.contains("hidden")) {
    return false;
  }
  const rect = tabBar.getBoundingClientRect();
  return (
    clientX >= rect.left &&
    clientX < rect.right &&
    clientY >= rect.top &&
    clientY < rect.bottom
  );
}

function clearTabBarDropIndicators(tabBar) {
  tabBar.querySelectorAll(".tab").forEach((t) => {
    t.classList.remove("tab-drag-over-left", "tab-drag-over-right");
  });
}

function updateTabBarDropIndicator(tabBar, clientX, skipIndex) {
  clearTabBarDropIndicators(tabBar);
  const tabs = tabBar.querySelectorAll(".tab");
  let matched = false;
  for (const t of tabs) {
    const idx = parseInt(t.dataset.index, 10);
    if (idx === skipIndex) {
      continue;
    }
    const rect = t.getBoundingClientRect();
    if (clientX >= rect.left && clientX < rect.right) {
      const midX = rect.left + rect.width / 2;
      t.classList.add(
        clientX < midX ? "tab-drag-over-left" : "tab-drag-over-right",
      );
      matched = true;
      break;
    }
  }
  if (!matched) {
    const lastVisible = [...tabs].findLast(
      (t) => parseInt(t.dataset.index, 10) !== skipIndex,
    );
    if (lastVisible) {
      lastVisible.classList.add("tab-drag-over-right");
    }
  }
}

function getDropTargetIndex(tabBar, clientX, skipIndex) {
  const tabs = tabBar.querySelectorAll(".tab");
  for (const t of tabs) {
    const idx = parseInt(t.dataset.index, 10);
    if (idx === skipIndex) {
      continue;
    }
    const rect = t.getBoundingClientRect();
    if (clientX >= rect.left && clientX < rect.right) {
      const midX = rect.left + rect.width / 2;
      return clientX < midX ? idx : idx + 1;
    }
  }
  return skipIndex;
}

function createTabGhost(sourceEl, clientX) {
  const ghost = sourceEl.cloneNode(true);
  const rect = sourceEl.getBoundingClientRect();
  ghost.className = "tab tab-active tab-ghost";
  ghost.style.width = `${rect.width}px`;
  ghost.style.left = `${clientX - rect.width / 2}px`;
  ghost.style.top = `${rect.top}px`;
  document.body.appendChild(ghost);
  return ghost;
}

export function bindSidebarDragEvents({
  projectList,
  state,
  el,
  invoke,
  crossWindowDrag,
  openFolderEntryInTabs,
  render,
  updateMenuState,
}) {
  projectList.querySelectorAll(".project-item").forEach((button) => {
    button.addEventListener("mousedown", (event) => {
      if (event.button !== 0) {
        return;
      }

      const path = button.dataset.path;
      if (!path) {
        return;
      }

      const startX = event.clientX;
      const startY = event.clientY;
      let dragging = false;
      let ghost = null;
      let phantomIndex = -1;
      let savedOpenFiles = null;
      let savedActiveTabIndex = -1;
      const fileName = baseName(path);

      function setupPhantomTab(clientX) {
        flushStateToActiveTabInState(state);
        savedOpenFiles = state.openFiles.map((t) => ({
          ...t,
          scrollState: { ...t.scrollState },
        }));
        savedActiveTabIndex = state.activeTabIndex;

        if (!hasTabSession(state) && state.activePath) {
          const currentTab = snapshotActiveFileAsTransferTab(state);
          if (currentTab) {
            state.openFiles = [currentTab];
            state.activeTabIndex = 0;
          }
        }

        const phantom = normalizeTransferTab({
          path,
          content: findOpenFileContent(savedOpenFiles, path) ?? "",
          kind: path.endsWith(".md") ? "markdown" : "text",
          writable: true,
          isDirty: false,
          markdownViewMode: "edit",
          scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
        });
        phantomIndex = state.openFiles.length;
        state.openFiles.push(phantom);
        render();

        const phantomEl = el.tabBar.querySelector(
          `.tab[data-index="${phantomIndex}"]`,
        );
        if (phantomEl) {
          phantomEl.classList.add("tab-dragging");
          ghost = createTabGhost(phantomEl, clientX);
        }
      }

      function restoreState() {
        if (savedOpenFiles) {
          state.openFiles = savedOpenFiles;
          state.activeTabIndex = savedActiveTabIndex;
          if (hasTabSession(state)) {
            syncActiveTabToStateFromTabs(state);
          }
          savedOpenFiles = null;
        }
      }

      function activateCrossWindowDrag() {
        const existingContent = findOpenFileContent(state.openFiles, path);
        crossWindowDrag.activateForPath(path, {
          title: fileName,
          content: existingContent ?? "",
        });
        if (existingContent === null) {
          invoke("read_text_file", { path })
            .then((payload) => {
              crossWindowDrag.setPreviewInfo({
                title: fileName,
                content: payload.content,
              });
            })
            .catch(() => {});
        }
      }

      function onMouseMove(e) {
        e.preventDefault();
        if (!dragging) {
          if (!shouldStartSidebarDrag(e.clientX - startX, e.clientY - startY)) {
            return;
          }
          dragging = true;
          document.documentElement.classList.add("tab-reordering");
          setupPhantomTab(e.clientX);
          activateCrossWindowDrag();
        }

        const outside = isCursorOutsideWindow(e.clientX, e.clientY);

        if (outside) {
          if (ghost) {
            ghost.classList.add("hidden");
          }
          el.tabBar.classList.add("hidden");
          clearTabBarDropIndicators(el.tabBar);
          crossWindowDrag.reportPosition(e.screenX, e.screenY);
        } else {
          crossWindowDrag.clearPreview();
          el.tabBar.classList.remove("hidden");
          if (ghost) {
            ghost.classList.remove("hidden");
            const phantomEl = el.tabBar.querySelector(
              `.tab[data-index="${phantomIndex}"]`,
            );
            const rect = phantomEl?.getBoundingClientRect();
            if (rect) {
              ghost.style.left = `${e.clientX - rect.width / 2}px`;
              ghost.style.top = `${rect.top}px`;
            }
          }
          updateTabBarDropIndicator(el.tabBar, e.clientX, phantomIndex);
        }
      }

      function cleanup() {
        if (ghost) {
          ghost.remove();
        }
        clearTabBarDropIndicators(el.tabBar);
        document.documentElement.classList.remove("tab-reordering");
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      }

      async function onMouseUp(e) {
        if (!dragging) {
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          return;
        }

        const outside = isCursorOutsideWindow(e.clientX, e.clientY);

        if (crossWindowDrag.currentTargetLabel()) {
          cleanup();
          restoreState();
          render();
          crossWindowDrag.completeDrop();
        } else if (outside) {
          cleanup();
          restoreState();
          render();
          crossWindowDrag.completeDropAsNewWindow(e.screenX, e.screenY);
        } else {
          const dropIndex = getDropTargetIndex(
            el.tabBar,
            e.clientX,
            phantomIndex,
          );
          cleanup();
          restoreState();
          render();
          crossWindowDrag.cancel();
          await openFolderEntryInTabs(path);
          const newIndex = state.openFiles.findIndex((f) => f.path === path);
          if (newIndex !== -1 && newIndex !== dropIndex) {
            const adjusted = dropIndex > newIndex ? dropIndex - 1 : dropIndex;
            const [tab] = state.openFiles.splice(newIndex, 1);
            state.openFiles.splice(adjusted, 0, tab);
            state.activeTabIndex = adjusted;
            syncActiveTabToStateFromTabs(state);
            render();
            updateMenuState();
          }
        }
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  });
}
