import {
  shouldCapturePreviousSingleFolderFile,
  shouldCollapseHiddenSingleTabForSidebarOpen,
  shouldSidebarSingleClickIgnoreSamePath,
  shouldSidebarSingleClickOpenAsTab,
  sidebarClickModifierAction,
} from "../ui/behavior.js";
import { bindSidebarDragEvents } from "./drag.js";
import { collectSubfolderPaths } from "./tree.js";

export function bindSidebarItemEvents({
  el,
  state,
  sidebarClickState,
  normalizeTransferTab,
  snapshotActiveFileAsTransferTab,
  hasTabSession,
  syncActiveTabToState,
  saveNow,
  replaceActiveTab,
  openEntry,
  openFolderEntryInTabs,
  render,
  updateMenuState,
  invoke,
  crossWindowDrag,
  markTreeDirty,
  renderSidebar,
}) {
  function rememberSidebarSingleClick(path) {
    sidebarClickState.lastPath = path || null;
    sidebarClickState.previousSingleTab = null;
  }

  function setSidebarSingleClickOpenPromise(promise) {
    sidebarClickState.openPromise = Promise.resolve(promise).catch(() => {});
  }

  function rememberSidebarPreviousSingleTab(tab) {
    sidebarClickState.previousSingleTab = tab
      ? normalizeTransferTab(tab)
      : null;
  }

  function consumeSidebarDoubleClickPromotion(path) {
    if (
      !path ||
      state.mode !== "folder" ||
      hasTabSession() ||
      state.activePath !== path ||
      sidebarClickState.lastPath !== path
    ) {
      return false;
    }

    const previousTab = normalizeTransferTab(
      sidebarClickState.previousSingleTab,
    );
    const currentTab = snapshotActiveFileAsTransferTab();
    if (!previousTab || !currentTab || previousTab.path === currentTab.path) {
      return false;
    }

    state.openFiles = [previousTab, currentTab];
    state.activeTabIndex = 1;
    syncActiveTabToState();
    render();
    updateMenuState();
    sidebarClickState.previousSingleTab = null;
    return true;
  }

  el.projectList.querySelectorAll(".project-item").forEach((button) => {
    button.addEventListener("mouseenter", () => {
      if (button.scrollWidth > button.clientWidth) {
        button.title = button.textContent;
      } else {
        button.removeAttribute("title");
      }
    });

    button.addEventListener("click", (event) => {
      if (event.detail !== 1) {
        return;
      }

      const path = button.dataset.path;
      if (!path) {
        return;
      }

      const modifierAction = sidebarClickModifierAction(event);

      if (modifierAction === "new-window") {
        invoke("open_paths_in_new_window", { paths: [path] });
        return;
      }

      if (modifierAction === "new-tab") {
        rememberSidebarSingleClick(path);
        const openPromise = (async () => {
          await saveNow();
          await openFolderEntryInTabs(path);
        })();
        setSidebarSingleClickOpenPromise(openPromise);
        return;
      }

      rememberSidebarSingleClick(path);

      const openPromise = (async () => {
        const openFilesCount = state.openFiles.length;

        if (
          shouldSidebarSingleClickIgnoreSamePath({
            mode: state.mode,
            openFilesCount,
            activePath: state.activePath,
            nextPath: path,
          })
        ) {
          return;
        }

        const shouldCapturePreviousSingleTab =
          shouldCapturePreviousSingleFolderFile({
            mode: state.mode,
            openFilesCount,
            activePath: state.activePath,
            nextPath: path,
          });

        await saveNow();

        if (shouldCapturePreviousSingleTab) {
          rememberSidebarPreviousSingleTab(snapshotActiveFileAsTransferTab());
        }

        if (
          shouldSidebarSingleClickOpenAsTab({
            mode: state.mode,
            openFilesCount: state.openFiles.length,
          })
        ) {
          await replaceActiveTab(path);
          return;
        }

        if (
          shouldCollapseHiddenSingleTabForSidebarOpen({
            mode: state.mode,
            openFilesCount: state.openFiles.length,
          })
        ) {
          state.openFiles = [];
          state.activeTabIndex = 0;
        }

        await openEntry(path);
      })();

      setSidebarSingleClickOpenPromise(openPromise);
    });

    button.addEventListener("dblclick", async (event) => {
      event.preventDefault();
      const path = button.dataset.path;
      if (!path) {
        return;
      }

      if (sidebarClickState.lastPath === path) {
        await sidebarClickState.openPromise;
        if (consumeSidebarDoubleClickPromotion(path)) {
          return;
        }
      }

      await saveNow();
      await openFolderEntryInTabs(path);
    });

    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
      const path = button.dataset.path;
      if (!path) {
        return;
      }
      invoke("show_sidebar_context_menu", { path });
    });
  });

  if (crossWindowDrag) {
    bindSidebarDragEvents({
      projectList: el.projectList,
      state,
      el,
      invoke,
      crossWindowDrag,
      openFolderEntryInTabs,
      render,
      updateMenuState,
    });
  }

  el.projectList.querySelectorAll(".folder-toggle").forEach((button) => {
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      window.getSelection()?.removeAllRanges();
      const { folderPath } = button.dataset;
      if (!folderPath || !state.rootPath) {
        return;
      }
      invoke("show_sidebar_context_menu", {
        path: `${state.rootPath}/${folderPath}`,
      });
    });

    button.addEventListener("mouseenter", () => {
      const label = button.querySelector(".folder-label");
      if (label && label.scrollWidth > label.clientWidth) {
        button.title = label.textContent;
      } else {
        button.removeAttribute("title");
      }
    });

    button.addEventListener("click", (event) => {
      const { folderPath } = button.dataset;
      if (!folderPath) {
        return;
      }

      if (event.altKey) {
        const subfolders = collectSubfolderPaths(folderPath, state.entries);
        if (state.collapsedFolders.has(folderPath)) {
          for (const p of subfolders) {
            state.collapsedFolders.delete(p);
          }
        } else {
          for (const p of subfolders) {
            state.collapsedFolders.add(p);
          }
        }
      } else if (state.collapsedFolders.has(folderPath)) {
        state.collapsedFolders.delete(folderPath);
      } else {
        state.collapsedFolders.add(folderPath);
      }

      markTreeDirty();
      renderSidebar();
    });
  });
}
