import { goBack, goForward, recordNavigation } from "./navigation.js";
import { createTabCloseController } from "./tab-close-controller.js";
import { createTabOpenController } from "./tab-open-controller.js";
import { buildUntitledTab, snapshotActiveStateAsTab } from "./tab-state.js";

export { buildTabFromPayload } from "./tab-state.js";

export function createTabController({
  state,
  invoke,
  baseName,
  setStatus,
  render,
  updateMenuState,
  markSidebarTreeDirty,
  saveNow,
  openFile,
  applyFilePayload,
  clearActiveFile,
  hasTabSession,
  flushStateToActiveTab,
  syncActiveTabToState,
  promptCloseDirty,
}) {
  function createNewTab() {
    flushStateToActiveTab();

    if (state.activePath && state.openFiles.length === 0) {
      const currentTab = snapshotActiveStateAsTab(state);
      if (currentTab) {
        state.openFiles = [currentTab];
      }
    }

    state.openFiles.push(buildUntitledTab());
    state.activeTabIndex = state.openFiles.length - 1;
    if (state.mode === "file" || state.mode === "empty") {
      state.mode = "files";
    }
    syncActiveTabToState();
    render();
    updateMenuState();
  }

  function getActiveNavState() {
    if (hasTabSession()) {
      const tab = state.openFiles[state.activeTabIndex];
      if (tab) {
        return tab;
      }
    }
    return state;
  }

  function recordNavOnActiveTab() {
    if (state.activePath) {
      recordNavigation(getActiveNavState(), state.activePath);
    }
  }

  const openController = createTabOpenController({
    state,
    invoke,
    baseName,
    setStatus,
    render,
    updateMenuState,
    markSidebarTreeDirty,
    saveNow,
    openFile,
    applyFilePayload,
    flushStateToActiveTab,
    syncActiveTabToState,
    recordNavOnActiveTab,
  });

  const closeController = createTabCloseController({
    state,
    invoke,
    baseName,
    setStatus,
    render,
    updateMenuState,
    markSidebarTreeDirty,
    saveNow,
    clearActiveFile,
    hasTabSession,
    flushStateToActiveTab,
    syncActiveTabToState,
    promptCloseDirty,
  });

  function switchTab(index) {
    if (index === state.activeTabIndex) {
      return;
    }
    flushStateToActiveTab();
    state.activeTabIndex = index;
    syncActiveTabToState();
    render();
    updateMenuState();
  }

  function moveTab(fromIndex, toIndex) {
    if (fromIndex === toIndex) {
      return;
    }
    const [tab] = state.openFiles.splice(fromIndex, 1);
    state.openFiles.splice(toIndex, 0, tab);

    const active = state.activeTabIndex;
    if (active === fromIndex) {
      state.activeTabIndex = toIndex;
    } else if (fromIndex < active && toIndex >= active) {
      state.activeTabIndex = active - 1;
    } else if (fromIndex > active && toIndex <= active) {
      state.activeTabIndex = active + 1;
    }

    render();
    updateMenuState();
  }

  async function navigateBack() {
    const navState = getActiveNavState();
    const target = goBack(navState);
    if (target === null) {
      return;
    }
    await openController.loadFileIntoActiveTab(target);
  }

  async function navigateForward() {
    const navState = getActiveNavState();
    const target = goForward(navState);
    if (target === null) {
      return;
    }
    await openController.loadFileIntoActiveTab(target);
  }

  return {
    createNewTab,
    openMultipleFiles: openController.openMultipleFiles,
    openFileAsTab: openController.openFileAsTab,
    openFileInTabs: openController.openFileInTabs,
    replaceActiveTab: openController.replaceActiveTab,
    switchTab,
    moveTab,
    closeTab: closeController.closeTab,
    closeSingleActiveFile: closeController.closeSingleActiveFile,
    closeActiveFileOrWindow: closeController.closeActiveFileOrWindow,
    navigateBack,
    navigateForward,
  };
}
