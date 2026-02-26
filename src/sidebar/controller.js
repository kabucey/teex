import {
  getSidebarSelectedPath,
  shouldSidebarSingleClickOpenAsTab,
  shouldSidebarSingleClickIgnoreSamePath,
  shouldCapturePreviousSingleFolderFile,
  shouldCollapseHiddenSingleTabForSidebarOpen,
} from "../ui/behavior.js";
import { buildEntryTree, renderTreeHtml } from "./tree.js";

export function createSidebarController({
  state,
  el,
  baseName,
  sidebarRenderState,
  sidebarClickState,
  normalizeTransferTab,
  snapshotActiveFileAsTransferTab,
  hasTabSession,
  syncActiveTabToState,
  saveNow,
  openFileAsTab,
  openEntry,
  openFolderEntryInTabs,
  render,
  updateMenuState,
}) {
  function markTreeDirty() {
    sidebarRenderState.treeDirty = true;
    sidebarRenderState.activePath = null;
  }

  function rememberSidebarSingleClick(path) {
    sidebarClickState.lastPath = path || null;
    sidebarClickState.previousSingleTab = null;
  }

  function setSidebarSingleClickOpenPromise(promise) {
    sidebarClickState.openPromise = Promise.resolve(promise).catch(() => {});
  }

  function rememberSidebarPreviousSingleTab(tab) {
    sidebarClickState.previousSingleTab = tab ? normalizeTransferTab(tab) : null;
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

    const previousTab = normalizeTransferTab(sidebarClickState.previousSingleTab);
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

  function syncSidebarActiveItem() {
    const selectedPath = getSidebarSelectedPath({
      mode: state.mode,
      activePath: state.activePath,
      entries: state.entries,
    });

    if (sidebarRenderState.activePath === selectedPath) {
      return;
    }

    if (sidebarRenderState.activePath) {
      const previous = el.projectList.querySelector(
        `.project-item.active[data-path="${CSS.escape(sidebarRenderState.activePath)}"]`,
      );
      if (previous) {
        previous.classList.remove("active");
      }
    }

    if (selectedPath) {
      const next = el.projectList.querySelector(
        `.project-item[data-path="${CSS.escape(selectedPath)}"]`,
      );
      if (next) {
        next.classList.add("active");
      }
    }

    sidebarRenderState.activePath = selectedPath;
  }

  function bindSidebarItemEvents() {
    el.projectList.querySelectorAll(".project-item").forEach((button) => {
      button.addEventListener("click", (event) => {
        if (event.detail !== 1) {
          return;
        }

        const path = button.dataset.path;
        if (!path) {
          return;
        }

        rememberSidebarSingleClick(path);

        const openPromise = (async () => {
          const openFilesCount = state.openFiles.length;

          if (shouldSidebarSingleClickIgnoreSamePath({
            mode: state.mode,
            openFilesCount,
            activePath: state.activePath,
            nextPath: path,
          })) {
            return;
          }

          const shouldCapturePreviousSingleTab = shouldCapturePreviousSingleFolderFile({
            mode: state.mode,
            openFilesCount,
            activePath: state.activePath,
            nextPath: path,
          });

          await saveNow();

          if (shouldCapturePreviousSingleTab) {
            rememberSidebarPreviousSingleTab(snapshotActiveFileAsTransferTab());
          }

          if (shouldSidebarSingleClickOpenAsTab({
            mode: state.mode,
            openFilesCount: state.openFiles.length,
          })) {
            await openFileAsTab(path);
            return;
          }

          if (shouldCollapseHiddenSingleTabForSidebarOpen({
            mode: state.mode,
            openFilesCount: state.openFiles.length,
          })) {
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
    });

    el.projectList.querySelectorAll(".folder-toggle").forEach((button) => {
      button.addEventListener("click", () => {
        const { folderPath } = button.dataset;
        if (!folderPath) {
          return;
        }

        if (state.collapsedFolders.has(folderPath)) {
          state.collapsedFolders.delete(folderPath);
        } else {
          state.collapsedFolders.add(folderPath);
        }

        markTreeDirty();
        renderSidebar();
      });
    });
  }

  function renderSidebar() {
    if (state.mode !== "folder") {
      el.projectRootLabel.textContent = "Folder";
      el.projectRootLabel.removeAttribute("title");
      el.projectList.innerHTML = "";
      sidebarRenderState.activePath = null;
      sidebarRenderState.treeDirty = true;
      return;
    }

    const rootPath = state.rootPath || "";
    el.projectRootLabel.textContent = rootPath ? baseName(rootPath) : "Folder";
    if (rootPath) {
      el.projectRootLabel.title = rootPath;
    } else {
      el.projectRootLabel.removeAttribute("title");
    }

    if (sidebarRenderState.treeDirty) {
      const tree = buildEntryTree(state.entries);
      el.projectList.innerHTML = renderTreeHtml(tree, 0, state.collapsedFolders);
      bindSidebarItemEvents();
      sidebarRenderState.treeDirty = false;
    }

    syncSidebarActiveItem();
  }

  return {
    markTreeDirty,
    renderSidebar,
  };
}
