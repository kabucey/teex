import { didGitStatusChange, fetchGitStatus } from "../sidebar/git-status.js";
import { collectFolderPaths } from "../sidebar/tree.js";
import {
  snapshotActiveStateAsTab,
  switchToSingleFileState,
} from "../tabs/tab-state.js";
import { getSingleFileUiOpenMode } from "../ui/behavior.js";

export function didProjectEntriesChange(previousEntries, nextEntries) {
  if (!Array.isArray(previousEntries) || !Array.isArray(nextEntries)) {
    return true;
  }

  if (previousEntries.length !== nextEntries.length) {
    return true;
  }

  for (let i = 0; i < previousEntries.length; i += 1) {
    const prev = previousEntries[i];
    const next = nextEntries[i];
    if (prev?.path !== next?.path || prev?.relPath !== next?.relPath) {
      return true;
    }
  }

  return false;
}

export function createFileController({
  state,
  invoke,
  baseName,
  saveNow,
  setStatus,
  render,
  updateMenuState,
  markSidebarTreeDirty,
  applyFilePayload,
  clearActiveFile,
  hasTabSession,
  openFileAsTab,
  openFileInTabs,
}) {
  let refreshInFlight = null;
  let pendingRefresh = false;

  async function clearProjectFolderWatch() {
    try {
      await invoke("clear_project_folder_watch");
    } catch {
      // Watch setup is best-effort; keep file operations working.
    }
  }

  async function watchProjectFolder(root) {
    if (!root) {
      await clearProjectFolderWatch();
      return;
    }

    try {
      await invoke("watch_project_folder", { root });
    } catch {
      // Watch setup is best-effort; keep file operations working.
    }
  }

  async function refreshOpenFolderEntries() {
    if (state.mode !== "folder" || !state.rootPath) {
      return;
    }

    if (refreshInFlight) {
      pendingRefresh = true;
      await refreshInFlight;
      return;
    }

    refreshInFlight = (async () => {
      try {
        const entries = await invoke("list_project_entries", {
          root: state.rootPath,
          showHidden: state.showHiddenFiles,
        });
        const nextGitStatus = await fetchGitStatus(invoke, state.rootPath);
        const entriesChanged = didProjectEntriesChange(state.entries, entries);
        const gitChanged = didGitStatusChange(
          state.gitStatusMap,
          nextGitStatus,
        );

        if (!entriesChanged && !gitChanged) {
          return;
        }

        if (entriesChanged) {
          state.entries = entries;

          const validFolderPaths = collectFolderPaths(entries);
          state.collapsedFolders = new Set(
            [...state.collapsedFolders].filter((folderPath) =>
              validFolderPaths.has(folderPath),
            ),
          );
        }

        state.gitStatusMap = nextGitStatus;
        markSidebarTreeDirty();
        render();
      } catch (error) {
        setStatus(String(error), true);
      }
    })();

    try {
      await refreshInFlight;
    } finally {
      refreshInFlight = null;
      if (pendingRefresh) {
        pendingRefresh = false;
        await refreshOpenFolderEntries();
      }
    }
  }

  async function openFile(path) {
    if (!path) {
      return;
    }

    await saveNow();
    await clearProjectFolderWatch();

    try {
      const payload = await invoke("read_text_file", { path });
      switchToSingleFileState({
        state,
        payload,
        applyFilePayload,
        markSidebarTreeDirty,
      });
      setStatus(`Opened ${baseName(path)}`);
    } catch (error) {
      setStatus(String(error), true);
    }

    render();
    updateMenuState();
  }

  async function openSingleFileFromUi(path) {
    if (!path) {
      return;
    }

    const openMode = getSingleFileUiOpenMode(state.mode);

    if (openMode === "folderTabs") {
      await openFolderEntryInTabs(path);
      return;
    }

    if (openMode === "tabs") {
      await openFileInTabs(path);
      return;
    }

    await openFile(path);
  }

  async function openFolder(path) {
    if (!path) {
      return;
    }

    await saveNow();
    await clearProjectFolderWatch();

    try {
      const entries = await invoke("list_project_entries", {
        root: path,
        showHidden: state.showHiddenFiles,
      });
      state.mode = "folder";
      state.rootPath = path;
      state.entries = entries;
      state.collapsedFolders = collectFolderPaths(entries);
      state.gitStatusMap = await fetchGitStatus(invoke, path);
      markSidebarTreeDirty();
      state.sidebarVisible = true;
      state.openFiles = [];
      state.activeTabIndex = 0;
      await watchProjectFolder(path);

      clearActiveFile();
      if (entries.length === 0) {
        setStatus("Folder has no text-like files");
      }
      render();
    } catch (error) {
      setStatus(String(error), true);
      render();
    }

    updateMenuState();
  }

  async function openEntry(path) {
    try {
      const payload = await invoke("read_text_file", { path });
      applyFilePayload(payload, { defaultMarkdownMode: "preview" });
      setStatus(`Opened ${baseName(path)}`);
      render();
      updateMenuState();
    } catch (error) {
      setStatus(String(error), true);
    }
  }

  async function openFolderEntryInTabs(path) {
    if (!path || state.mode !== "folder") {
      return;
    }

    if (hasTabSession()) {
      await openFileAsTab(path);
      return;
    }

    if (!state.activePath) {
      await openEntry(path);
      return;
    }

    if (state.activePath === path) {
      return;
    }

    const currentTab = snapshotActiveStateAsTab(state);
    if (!currentTab) {
      await openEntry(path);
      return;
    }

    state.openFiles = [currentTab];
    state.activeTabIndex = 0;

    await openFileAsTab(path);
  }

  return {
    openFile,
    openSingleFileFromUi,
    openFolder,
    openEntry,
    openFolderEntryInTabs,
    refreshOpenFolderEntries,
    clearProjectFolderWatch,
  };
}
