import { promptToSaveBeforeClose } from "../ui/close-dirty-dialog.js";

export function createTabCloseController({
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
  promptCloseDirty = promptToSaveBeforeClose,
  confirmDelete,
}) {
  let closeInProgress = false;

  async function canCloseDirtyTab(index) {
    const tab = state.openFiles[index];
    if (!tab) {
      return true;
    }

    const isActive = index === state.activeTabIndex;
    const isDirty = isActive ? state.isDirty : tab.isDirty;
    if (!isDirty) {
      return true;
    }

    const label = tab.path ? baseName(tab.path) : "Untitled";
    const decision = await promptCloseDirty(label);
    if (decision === "cancel") {
      return false;
    }
    if (decision === "discard") {
      return true;
    }

    if (!isActive && tab.path && tab.writable) {
      try {
        await invoke("write_text_file", {
          path: tab.path,
          content: tab.content,
        });
        tab.isDirty = false;
        return true;
      } catch (error) {
        setStatus(String(error), true);
        return false;
      }
    }

    let previousActiveIndex = null;
    if (!isActive) {
      previousActiveIndex = state.activeTabIndex;
      flushStateToActiveTab();
      state.activeTabIndex = index;
      syncActiveTabToState();
    }

    await saveNow();
    const saveSucceeded = !state.isDirty;
    if (!saveSucceeded && previousActiveIndex !== null) {
      flushStateToActiveTab();
      state.activeTabIndex = previousActiveIndex;
      syncActiveTabToState();
      render();
      updateMenuState();
    }
    return saveSucceeded;
  }

  async function canCloseSingleActiveFile() {
    if (!state.activePath || !state.isDirty) {
      return true;
    }

    const decision = await promptCloseDirty(baseName(state.activePath));
    if (decision === "cancel") {
      return false;
    }
    if (decision === "discard") {
      return true;
    }

    await saveNow();
    return !state.isDirty;
  }

  async function closeTabAtIndex(index) {
    const tab = state.openFiles[index];
    if (!tab) {
      return;
    }

    if (!(await canCloseDirtyTab(index))) {
      return;
    }

    state.openFiles.splice(index, 1);

    if (state.openFiles.length === 0) {
      state.openFiles = [];
      state.activeTabIndex = 0;
      clearActiveFile();
      if (state.mode !== "folder") {
        state.mode = "empty";
        markSidebarTreeDirty();
      }
      render();
      updateMenuState();
      return;
    }

    if (state.activeTabIndex >= state.openFiles.length) {
      state.activeTabIndex = state.openFiles.length - 1;
    }
    syncActiveTabToState();
    render();
    updateMenuState();
  }

  async function closeTab(index) {
    if (closeInProgress) {
      return;
    }
    closeInProgress = true;
    try {
      await closeTabAtIndex(index);
    } finally {
      closeInProgress = false;
    }
  }

  async function closeOtherTabs(targetIndex) {
    if (closeInProgress) {
      return;
    }
    closeInProgress = true;
    try {
      const total = state.openFiles.length;
      for (let i = total - 1; i > targetIndex; i -= 1) {
        await closeTabAtIndex(i);
      }
      for (let i = targetIndex - 1; i >= 0; i -= 1) {
        await closeTabAtIndex(i);
      }
    } finally {
      closeInProgress = false;
    }
  }

  async function closeSingleActiveFile() {
    if (closeInProgress) {
      return;
    }
    closeInProgress = true;
    try {
      if (!state.activePath) {
        return;
      }

      const closingLabel = baseName(state.activePath);
      if (!(await canCloseSingleActiveFile())) {
        return;
      }

      state.openFiles = [];
      state.activeTabIndex = 0;
      clearActiveFile();
      if (state.mode !== "folder") {
        state.mode = "empty";
        markSidebarTreeDirty();
      }

      setStatus(`Closed ${closingLabel}`);
      render();
      updateMenuState();
    } finally {
      closeInProgress = false;
    }
  }

  async function closeActiveFileOrWindow() {
    if (hasTabSession()) {
      await closeTab(state.activeTabIndex);
    } else if (state.activePath) {
      await closeSingleActiveFile();
    }

    if (state.mode === "empty") {
      await invoke("close_current_window").catch((error) => {
        setStatus(String(error), true);
      });
    }
  }

  async function deleteAndCloseTabs(path, { onAllClosed } = {}) {
    const name = baseName(path);
    const confirmed = await confirmDelete(name);
    if (!confirmed) {
      return;
    }
    try {
      await invoke("trash_file", { path });
      const pathPrefix = `${path}/`;
      if (hasTabSession()) {
        const indices = state.openFiles
          .map((_t, i) => i)
          .filter((i) => {
            const p = state.openFiles[i].path;
            return p === path || p.startsWith(pathPrefix);
          })
          .reverse();
        for (const i of indices) {
          await closeTab(i);
        }
      } else if (
        state.activePath === path ||
        state.activePath?.startsWith(pathPrefix)
      ) {
        await closeSingleActiveFile();
        onAllClosed?.();
      }
    } catch (err) {
      console.error("Failed to move to trash:", err);
    }
  }

  return {
    closeActiveFileOrWindow,
    closeSingleActiveFile,
    closeTab,
    closeOtherTabs,
    deleteAndCloseTabs,
  };
}
