export function sessionPaths(session) {
  if (session.mode === "folder" && session.folderPath) {
    return [session.folderPath];
  }
  return (session.tabs ?? []).map((tab) => tab.path).filter(Boolean);
}

function restoreFolderExpansionState({
  state,
  session,
  buildCollapsedFoldersFromExpanded,
  markSidebarTreeDirty,
}) {
  const expandedFolders = new Set(
    (session.expandedFolders ?? []).filter((path) => typeof path === "string"),
  );
  state.collapsedFolders = buildCollapsedFoldersFromExpanded(
    state.entries,
    expandedFolders,
  );
  markSidebarTreeDirty();
}

export function createSessionRestoreController({
  state,
  invoke,
  loadAllSessions,
  clearAllSessions,
  pruneStaleWindows,
  buildCollapsedFoldersFromExpanded,
  reconcileRestoredFolderTabs,
  markSidebarTreeDirty,
  openFolder,
  openFile,
  openMultipleFiles,
  openFolderEntryInTabs,
  switchTab,
  render,
}) {
  async function restoreFolderTabs(session) {
    const paths = (session.tabs ?? []).map((tab) => tab.path).filter(Boolean);
    if (paths.length === 0) {
      return;
    }

    for (const path of paths) {
      await openFolderEntryInTabs(path);
    }

    const { switchToIndex } = reconcileRestoredFolderTabs(
      state,
      session.tabs,
      session.activeTabIndex,
    );
    if (switchToIndex >= 0) {
      switchTab(switchToIndex);
    }
    render();
  }

  async function restoreSessionInCurrentWindow(session) {
    if (session.mode === "folder" && session.folderPath) {
      await openFolder(session.folderPath);
      restoreFolderExpansionState({
        state,
        session,
        buildCollapsedFoldersFromExpanded,
        markSidebarTreeDirty,
      });
      await restoreFolderTabs(session);
      return;
    }

    const paths = sessionPaths(session);
    if (!paths.length) {
      return;
    }

    if (paths.length === 1) {
      await openFile(paths[0]);
      return;
    }

    await openMultipleFiles(paths);
    const targetIndex = session.activeTabIndex ?? 0;
    if (targetIndex > 0 && targetIndex < state.openFiles.length) {
      switchTab(targetIndex);
    }
  }

  async function restoreLastSession() {
    const sessions = loadAllSessions();
    if (sessions.length === 0) {
      return;
    }

    clearAllSessions();
    await restoreSessionInCurrentWindow(sessions[0]);

    for (let i = 1; i < sessions.length; i += 1) {
      const paths = sessionPaths(sessions[i]);
      if (paths.length > 0) {
        await invoke("open_paths_in_new_window", { paths });
      }
    }
  }

  function pruneStaleWindowsAsync() {
    invoke("get_all_window_labels")
      .then((labels) => pruneStaleWindows(labels))
      .catch(() => {});
  }

  return {
    pruneStaleWindowsAsync,
    restoreLastSession,
  };
}
