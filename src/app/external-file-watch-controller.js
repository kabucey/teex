export function collectWatchedProjectFilePaths(state) {
  const paths = new Set();

  if (Array.isArray(state.openFiles) && state.openFiles.length > 0) {
    for (const tab of state.openFiles) {
      if (tab && typeof tab.path === "string" && tab.path) {
        paths.add(tab.path);
      }
    }
  } else if (typeof state.activePath === "string" && state.activePath) {
    paths.add(state.activePath);
  }

  return [...paths].sort();
}

export function buildWatchedProjectFileSignature(paths) {
  return paths.join("\n");
}

export function createExternalFileWatchController({
  state,
  invoke,
  baseName,
  hasTabSession,
  applyFilePayload,
  render,
  updateMenuState,
  setStatus,
  confirmReloadExternalChange,
}) {
  const watchState = {
    signature: "",
    syncPromise: null,
    pendingSync: false,
    recentlySavedAtByPath: new Map(),
    handlingChangedPaths: new Set(),
  };

  function findOpenTabIndexByPath(path) {
    return state.openFiles.findIndex((tab) => tab?.path === path);
  }

  function isActiveFileDirtyForPath(path) {
    return state.activePath === path && state.isDirty;
  }

  function isOpenTabDirtyForPath(path) {
    const index = findOpenTabIndexByPath(path);
    if (index === -1) {
      return false;
    }
    return Boolean(state.openFiles[index]?.isDirty);
  }

  async function reloadExternallyChangedFile(path) {
    const hasTabs = hasTabSession();
    const isActive = state.activePath === path;
    const isDirty = hasTabs
      ? isOpenTabDirtyForPath(path)
      : isActiveFileDirtyForPath(path);

    if (isDirty) {
      if (isActive) {
        const confirmed = await confirmReloadExternalChange(baseName(path));
        if (!confirmed) {
          setStatus(
            `External change detected for ${baseName(path)} (kept local edits)`,
            true,
          );
          return;
        }
      } else {
        setStatus(
          `External change detected for dirty tab ${baseName(path)}`,
          true,
        );
        return;
      }
    }

    try {
      const payload = await invoke("read_text_file", { path });

      if (hasTabs) {
        const tabIndex = findOpenTabIndexByPath(path);
        if (tabIndex === -1) {
          return;
        }
        const tab = state.openFiles[tabIndex];
        if (!tab) {
          return;
        }
        tab.content = payload.content;
        tab.kind = payload.kind;
        tab.writable = payload.writable;
        tab.isDirty = false;
        if (payload.kind !== "markdown") {
          tab.markdownViewMode = "edit";
        }

        if (state.activeTabIndex === tabIndex) {
          applyFilePayload(payload, {
            defaultMarkdownMode: "preview",
            preserveMarkdownMode: true,
          });
        }
      } else if (isActive) {
        applyFilePayload(payload, {
          defaultMarkdownMode: "preview",
          preserveMarkdownMode: true,
        });
      } else {
        return;
      }

      setStatus(`Reloaded ${baseName(path)} (changed outside Teex)`);
      render();
      updateMenuState();
    } catch (error) {
      setStatus(String(error), true);
    }
  }

  function syncWatchedProjectFiles() {
    const paths = collectWatchedProjectFilePaths(state);
    const signature = buildWatchedProjectFileSignature(paths);

    if (watchState.signature === signature && !watchState.pendingSync) {
      return;
    }

    watchState.signature = signature;

    if (watchState.syncPromise) {
      watchState.pendingSync = true;
      return;
    }

    watchState.syncPromise = (async () => {
      try {
        await invoke("watch_project_files", { paths });
      } catch (error) {
        setStatus(String(error), true);
      }
    })().finally(() => {
      watchState.syncPromise = null;
      if (watchState.pendingSync) {
        watchState.pendingSync = false;
        syncWatchedProjectFiles();
      }
    });
  }

  function onFileSaved(path) {
    if (typeof path !== "string" || !path) {
      return;
    }
    watchState.recentlySavedAtByPath.set(path, Date.now());
    setTimeout(() => {
      const savedAt = watchState.recentlySavedAtByPath.get(path);
      if (savedAt && Date.now() - savedAt >= 1200) {
        watchState.recentlySavedAtByPath.delete(path);
      }
    }, 1500);
  }

  async function handleProjectFileChanged(path) {
    if (typeof path !== "string" || !path) {
      return;
    }

    const savedAt = watchState.recentlySavedAtByPath.get(path);
    if (savedAt && Date.now() - savedAt < 1200) {
      return;
    }

    if (watchState.handlingChangedPaths.has(path)) {
      return;
    }

    watchState.handlingChangedPaths.add(path);
    try {
      await reloadExternallyChangedFile(path);
    } finally {
      watchState.handlingChangedPaths.delete(path);
    }
  }

  return {
    handleProjectFileChanged,
    onFileSaved,
    syncWatchedProjectFiles,
  };
}
