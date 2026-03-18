import {
  getSidebarSelectedPath,
  shouldCapturePreviousSingleFolderFile,
  shouldCollapseHiddenSingleTabForSidebarOpen,
  shouldSidebarSingleClickIgnoreSamePath,
  shouldSidebarSingleClickOpenAsTab,
  sidebarClickModifierAction,
} from "../ui/behavior.js";
import { bindSidebarDragEvents } from "./drag.js";
import { propagateFolderStatus } from "./git-status.js";
import {
  buildEntryTree,
  collectFolderPaths,
  hasFoldersInEntries,
  isAllCollapsed,
  renderTreeHtml,
} from "./tree.js";

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
  replaceActiveTab,
  openEntry,
  openFolderEntryInTabs,
  render,
  updateMenuState,
  invoke,
  crossWindowDrag,
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
      button.addEventListener("mouseenter", () => {
        const label = button.querySelector(".folder-label");
        if (label && label.scrollWidth > label.clientWidth) {
          button.title = label.textContent;
        } else {
          button.removeAttribute("title");
        }
      });

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

  function toggleCollapseAllFolders() {
    if (state.mode !== "folder") return;
    const allCollapsed = isAllCollapsed(state.entries, state.collapsedFolders);
    if (allCollapsed) {
      state.collapsedFolders = state.savedCollapsedFolders ?? new Set();
      state.savedCollapsedFolders = null;
    } else {
      state.savedCollapsedFolders = new Set(state.collapsedFolders);
      state.collapsedFolders = collectFolderPaths(state.entries);
    }
    markTreeDirty();
    renderSidebar();
  }

  function expandAllFolders() {
    if (state.mode !== "folder") return;
    state.collapsedFolders = new Set();
    state.savedCollapsedFolders = null;
    markTreeDirty();
    renderSidebar();
  }

  function updateCollapseToggleButton() {
    if (!el.collapseToggleBtn) return;
    const hasFolders =
      state.mode === "folder" && hasFoldersInEntries(state.entries);
    el.collapseToggleBtn.hidden = !hasFolders;
    if (hasFolders) {
      const allCollapsed = isAllCollapsed(
        state.entries,
        state.collapsedFolders,
      );
      el.collapseToggleBtn.classList.toggle("expand", allCollapsed);
      const label = allCollapsed
        ? "Expand folders (long press to expand all)"
        : "Collapse all folders";
      el.collapseToggleBtn.title = label;
      el.collapseToggleBtn.setAttribute("aria-label", label);
    }
  }

  function renderSidebar() {
    if (state.mode !== "folder") {
      el.projectRootLabel.textContent = "Folder";
      el.projectRootLabel.removeAttribute("title");
      el.projectList.innerHTML = "";
      sidebarRenderState.activePath = null;
      sidebarRenderState.treeDirty = true;
      updateCollapseToggleButton();
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
      const augmentedGitMap = propagateFolderStatus(state.gitStatusMap);
      el.projectList.innerHTML = renderTreeHtml(
        tree,
        0,
        state.collapsedFolders,
        augmentedGitMap,
      );
      bindSidebarItemEvents();
      sidebarRenderState.treeDirty = false;
    }

    syncSidebarActiveItem();
    updateCollapseToggleButton();
  }

  return {
    markTreeDirty,
    renderSidebar,
    toggleCollapseAllFolders,
    expandAllFolders,
  };
}
