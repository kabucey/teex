import { getSidebarSelectedPath } from "../ui/behavior.js";
import { bindSidebarItemEvents } from "./events.js";
import {
  filterEntriesByGitStatus,
  propagateFolderStatus,
} from "./git-status.js";
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
  let eventsBound = false;

  function markTreeDirty() {
    sidebarRenderState.treeDirty = true;
    sidebarRenderState.activePath = null;
  }

  function getEntriesToRender() {
    return state.filterModifiedOnly
      ? filterEntriesByGitStatus(state.entries, state.gitStatusMap)
      : state.entries;
  }

  function getCachedTree(entriesToRender) {
    if (sidebarRenderState.cachedTreeEntries !== entriesToRender) {
      sidebarRenderState.cachedTreeEntries = entriesToRender;
      sidebarRenderState.cachedTree = buildEntryTree(entriesToRender);
    }
    return sidebarRenderState.cachedTree;
  }

  function getCachedGitStatusMap() {
    if (sidebarRenderState.cachedGitStatusSource !== state.gitStatusMap) {
      sidebarRenderState.cachedGitStatusSource = state.gitStatusMap;
      sidebarRenderState.cachedAugmentedGitMap = propagateFolderStatus(
        state.gitStatusMap,
      );
    }
    return sidebarRenderState.cachedAugmentedGitMap;
  }

  function applyCollapsedStateToDom() {
    if (!el.projectList?.querySelectorAll) {
      return;
    }

    el.projectList.querySelectorAll(".folder-toggle").forEach((folder) => {
      const { folderPath } = folder.dataset;
      if (!folderPath) {
        return;
      }
      const expanded = !state.collapsedFolders.has(folderPath);
      folder.setAttribute("aria-expanded", String(expanded));
    });

    el.projectList.querySelectorAll(".folder-children").forEach((children) => {
      const previous = children.previousElementSibling;
      const folderPath = previous?.dataset?.folderPath;
      if (!folderPath) {
        return;
      }
      children.hidden = state.collapsedFolders.has(folderPath);
    });
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

  function toggleCollapseAllFolders() {
    if (state.mode !== "folder") return;
    const allCollapsed = isAllCollapsed(state.entries, state.collapsedFolders);
    if (allCollapsed) {
      state.collapsedFolders = new Set();
    } else {
      state.collapsedFolders = collectFolderPaths(state.entries);
    }

    if (sidebarRenderState.treeDirty) {
      renderSidebar();
      return;
    }

    applyCollapsedStateToDom();
    syncSidebarActiveItem();
    updateModifiedToggleButton();
    updateCollapseToggleButton();
  }

  function updateCollapseToggleButton() {
    if (!el.collapseToggleBtn) return;
    const hasFolders =
      state.mode === "folder" && hasFoldersInEntries(state.entries);
    el.collapseToggleBtn.style.visibility = hasFolders ? "" : "hidden";
    if (hasFolders) {
      const allCollapsed = isAllCollapsed(
        state.entries,
        state.collapsedFolders,
      );
      el.collapseToggleBtn.classList.toggle("expand", allCollapsed);
      const label = allCollapsed
        ? "Expand all folders (⇧⌘E)"
        : "Collapse all folders (⇧⌘E)";
      el.collapseToggleBtn.title = label;
      el.collapseToggleBtn.setAttribute("aria-label", label);
    }
  }

  function updateModifiedToggleButton() {
    if (!el.modifiedToggleBtn) {
      return;
    }

    const isFolderMode = state.mode === "folder";
    el.modifiedToggleBtn.style.visibility = isFolderMode ? "" : "hidden";
    el.modifiedToggleBtn.classList.toggle("active", state.filterModifiedOnly);
    el.modifiedToggleBtn.setAttribute(
      "aria-pressed",
      state.filterModifiedOnly ? "true" : "false",
    );

    const label = state.filterModifiedOnly
      ? "Show all files"
      : "Show modified files only";
    el.modifiedToggleBtn.title = label;
    el.modifiedToggleBtn.setAttribute("aria-label", label);
  }

  function renderSidebar() {
    if (state.mode !== "folder") {
      el.projectRootLabel.textContent = "Folder";
      el.projectRootLabel.removeAttribute("title");
      el.projectList.innerHTML = "";
      sidebarRenderState.activePath = null;
      sidebarRenderState.treeDirty = true;
      updateModifiedToggleButton();
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
      const entriesToRender = getEntriesToRender();

      if (state.filterModifiedOnly && entriesToRender.length === 0) {
        el.projectList.innerHTML =
          '<p class="sidebar-empty-state">No modified files.</p>';
      } else {
        const tree = getCachedTree(entriesToRender);
        const augmentedGitMap = getCachedGitStatusMap();
        el.projectList.innerHTML = renderTreeHtml(
          tree,
          0,
          state.collapsedFolders,
          augmentedGitMap,
          state.folderIconUrl,
        );
        if (!eventsBound) {
          bindSidebarItemEvents({
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
          });
          eventsBound = true;
        }
      }
      sidebarRenderState.treeDirty = false;
    }

    syncSidebarActiveItem();
    updateModifiedToggleButton();
    updateCollapseToggleButton();
  }

  return {
    markTreeDirty,
    renderSidebar,
    toggleCollapseAllFolders,
  };
}
