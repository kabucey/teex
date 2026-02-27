import { promptToSaveBeforeClose } from "../ui/close-dirty-dialog.js";

export function buildTabFromPayload(payload) {
  return {
    path: payload.path,
    content: payload.content,
    kind: payload.kind,
    writable: payload.writable,
    isDirty: false,
    markdownViewMode: payload.kind === "markdown" ? "preview" : "edit",
    scrollState: {
      editorScrollTop: 0,
      previewScrollTop: 0,
    },
  };
}

async function clearProjectFolderWatch(invoke) {
  try {
    await invoke("clear_project_folder_watch");
  } catch {
    // Best-effort cleanup only.
  }
}

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
  promptCloseDirty = promptToSaveBeforeClose,
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
        await invoke("write_text_file", { path: tab.path, content: tab.content });
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

  async function openMultipleFiles(paths) {
    await saveNow();

    const loaded = [];
    for (const path of paths) {
      try {
        const payload = await invoke("read_text_file", { path });
        loaded.push(buildTabFromPayload(payload));
      } catch (error) {
        setStatus(String(error), true);
      }
    }

    if (loaded.length === 0) {
      render();
      updateMenuState();
      return;
    }

    if (loaded.length === 1) {
      await clearProjectFolderWatch(invoke);
      const tab = loaded[0];
      state.mode = "file";
      state.sidebarVisible = false;
      state.rootPath = null;
      state.entries = [];
      markSidebarTreeDirty();
      state.openFiles = [];
      applyFilePayload(tab, { defaultMarkdownMode: "preview" });
      setStatus(`Opened ${baseName(tab.path)}`);
      render();
      updateMenuState();
      return;
    }

    await clearProjectFolderWatch(invoke);
    state.mode = "files";
    state.sidebarVisible = false;
    state.rootPath = null;
    state.entries = [];
    markSidebarTreeDirty();
    state.openFiles = loaded;
    state.activeTabIndex = 0;
    syncActiveTabToState();
    setStatus(`Opened ${loaded.length} files`);
    render();
    updateMenuState();
  }

  async function openFileAsTab(path) {
    if (!path) {
      return;
    }

    const existing = state.openFiles.findIndex((f) => f.path === path);
    if (existing !== -1) {
      flushStateToActiveTab();
      state.activeTabIndex = existing;
      syncActiveTabToState();
      render();
      updateMenuState();
      return;
    }

    try {
      const payload = await invoke("read_text_file", { path });
      const tab = buildTabFromPayload(payload);
      flushStateToActiveTab();
      state.openFiles.push(tab);
      state.activeTabIndex = state.openFiles.length - 1;
      syncActiveTabToState();
      setStatus(`Opened ${baseName(path)}`);
      render();
      updateMenuState();
    } catch (error) {
      setStatus(String(error), true);
    }
  }

  async function openFileInTabs(path) {
    if (!path) {
      return;
    }

    if (state.mode === "files") {
      await openFileAsTab(path);
      return;
    }

    if (state.mode !== "file" || !state.activePath) {
      await openFile(path);
      return;
    }

    if (state.activePath === path) {
      return;
    }

    await saveNow();

    try {
      const payload = await invoke("read_text_file", { path });
      const currentTab = {
        path: state.activePath,
        content: state.content,
        kind: state.activeKind,
        writable: true,
        isDirty: state.isDirty,
        markdownViewMode: state.markdownViewMode,
        scrollState: {
          editorScrollTop: state.activeEditorScrollTop,
          previewScrollTop: state.activePreviewScrollTop,
        },
      };
      const nextTab = buildTabFromPayload(payload);

      await clearProjectFolderWatch(invoke);
      state.mode = "files";
      state.sidebarVisible = false;
      state.rootPath = null;
      state.entries = [];
      markSidebarTreeDirty();
      state.openFiles = [currentTab, nextTab];
      state.activeTabIndex = 1;
      syncActiveTabToState();
      setStatus(`Opened ${baseName(path)}`);
      render();
      updateMenuState();
    } catch (error) {
      setStatus(String(error), true);
    }
  }

  function createNewTab() {
    flushStateToActiveTab();

    if (state.activePath && state.openFiles.length === 0) {
      const currentTab = {
        path: state.activePath,
        content: state.content,
        kind: state.activeKind,
        writable: true,
        isDirty: state.isDirty,
        markdownViewMode: state.markdownViewMode,
        scrollState: {
          editorScrollTop: state.activeEditorScrollTop,
          previewScrollTop: state.activePreviewScrollTop,
        },
      };
      state.openFiles = [currentTab];
    }

    const untitledTab = {
      path: null,
      content: "",
      kind: "markdown",
      writable: true,
      isDirty: false,
      markdownViewMode: "edit",
      scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
    };

    state.openFiles.push(untitledTab);
    state.activeTabIndex = state.openFiles.length - 1;
    if (state.mode === "file" || state.mode === "empty") {
      state.mode = "files";
    }
    syncActiveTabToState();
    render();
    updateMenuState();
  }

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

    // Keep activeTabIndex pointing at the same tab.
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

  async function closeTab(index) {
    if (closeInProgress) {
      return;
    }
    closeInProgress = true;
    try {
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
      return;
    }

    if (state.activePath) {
      await closeSingleActiveFile();
      return;
    }

    await invoke("close_current_window").catch((error) => {
      setStatus(String(error), true);
    });
  }

  return {
    createNewTab,
    openMultipleFiles,
    openFileAsTab,
    openFileInTabs,
    switchTab,
    moveTab,
    closeTab,
    closeSingleActiveFile,
    closeActiveFileOrWindow,
  };
}
