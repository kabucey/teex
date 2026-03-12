import {
  buildTabFromPayload,
  snapshotActiveStateAsTab,
  switchToMultiTabFileState,
  switchToSingleFileState,
} from "./tab-state.js";

async function clearProjectFolderWatch(invoke) {
  try {
    await invoke("clear_project_folder_watch");
  } catch {
    // Best-effort cleanup only.
  }
}

function isEmptyUntitledActiveState(state) {
  if (state.activePath || state.isDirty) {
    return false;
  }

  return typeof state.content === "string" && state.content.trim().length === 0;
}

export function createTabOpenController({
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
}) {
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
      switchToSingleFileState({
        state,
        payload: tab,
        applyFilePayload,
        markSidebarTreeDirty,
      });
      setStatus(`Opened ${baseName(tab.path)}`);
      render();
      updateMenuState();
      return;
    }

    await clearProjectFolderWatch(invoke);
    switchToMultiTabFileState({
      state,
      tabs: loaded,
      activeTabIndex: 0,
      markSidebarTreeDirty,
    });
    syncActiveTabToState();
    setStatus(`Opened ${loaded.length} files`);
    render();
    updateMenuState();
  }

  async function openFileAsTab(path) {
    if (!path) {
      return;
    }

    const existing = state.openFiles.findIndex((file) => file.path === path);
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
      const hasOnlyEmptyUntitledTab =
        state.openFiles.length === 1 &&
        state.activeTabIndex === 0 &&
        isEmptyUntitledActiveState(state);
      if (hasOnlyEmptyUntitledTab) {
        await openFile(path);
        return;
      }
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

    try {
      const payload = await invoke("read_text_file", { path });
      const currentTab = snapshotActiveStateAsTab(state);
      const nextTab = buildTabFromPayload(payload);
      if (!currentTab) {
        return;
      }

      await clearProjectFolderWatch(invoke);
      switchToMultiTabFileState({
        state,
        tabs: [currentTab, nextTab],
        activeTabIndex: 1,
        markSidebarTreeDirty,
      });
      syncActiveTabToState();
      setStatus(`Opened ${baseName(path)}`);
      render();
      updateMenuState();
    } catch (error) {
      setStatus(String(error), true);
    }
  }

  async function replaceActiveTab(path) {
    if (!path) {
      return;
    }

    try {
      const payload = await invoke("read_text_file", { path });
      const tab = buildTabFromPayload(payload);
      flushStateToActiveTab();
      const previous = state.openFiles[state.activeTabIndex];
      if (previous) {
        tab.navHistory = previous.navHistory;
        tab.navHistoryCursor = previous.navHistoryCursor;
        if (previous.path && !Array.isArray(tab.navHistory)) {
          tab.navHistory = [previous.path];
          tab.navHistoryCursor = 0;
        }
      }
      state.openFiles[state.activeTabIndex] = tab;
      syncActiveTabToState();
      recordNavOnActiveTab();
      setStatus(`Opened ${baseName(path)}`);
      render();
      updateMenuState();
    } catch (error) {
      setStatus(String(error), true);
    }
  }

  async function loadFileIntoActiveTab(path) {
    try {
      const payload = await invoke("read_text_file", { path });
      applyFilePayload(payload, { defaultMarkdownMode: "preview" });
      flushStateToActiveTab();
      const tab = state.openFiles[state.activeTabIndex];
      if (tab) {
        tab.path = payload.path;
        tab.kind = payload.kind;
        tab.writable = payload.writable;
      }
      render();
      updateMenuState();
    } catch (error) {
      setStatus(String(error), true);
    }
  }

  return {
    loadFileIntoActiveTab,
    openFileAsTab,
    openFileInTabs,
    openMultipleFiles,
    replaceActiveTab,
  };
}
