import { baseName } from "./app-utils.js";
import {
  bindElements as bindElementsImported,
  bindUiEvents as bindUiEventsImported,
} from "./ui/bindings-controller.js";
import {
  applyFilePayloadToState,
  clearActiveFileInState,
  flushStateToActiveTabInState,
  hasTabSession as hasTabSessionInState,
  normalizeTransferTab as normalizeTransferTabRecord,
  snapshotActiveFileAsTransferTab as snapshotActiveFileTransfer,
  snapshotAllOpenTabsForTransfer as snapshotAllTransfers,
  syncActiveTabToStateFromTabs,
} from "./tabs/session.js";
import { setupControllers } from "./app/controller-setup.js";
import { createRuntimeState, EVENTS } from "./app/runtime-state.js";
import {
  saveWindowSession,
  loadAllSessions,
  pruneStaleWindows,
  clearAllSessions,
} from "./app/session-persistence.js";
import { createScrollSyncController } from "./ui/scroll-sync.js";
import { confirmReloadExternalChange } from "./ui/native-dialog.js";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const {
  state,
  el,
  sidebarRenderState,
  sidebarClickState,
  osOpenDeduper,
  pendingOutgoingTabTransfers,
  dropOverlayDragState,
} = createRuntimeState();
let sidebarController;
let uiRenderer;
let tabTransferController;
let tabController;
let fileController;
let editorController;
let openPathsController;
let dragDropController;
let appEventsController;
let scrollSyncController;
let sessionSaveEnabled = false;
const externalFileWatchState = {
  signature: "",
  syncPromise: null,
  pendingSync: false,
  recentlySavedAtByPath: new Map(),
  handlingChangedPaths: new Set(),
};

({
  sidebarController,
  uiRenderer,
  editorController,
  tabTransferController,
  tabController,
  fileController,
  openPathsController,
  dragDropController,
  appEventsController,
} = setupControllers({
  state,
  el,
  invoke,
  listen,
  baseName,
  events: EVENTS,
  sidebarRenderState,
  sidebarClickState,
  osOpenDeduper,
  pendingOutgoingTabTransfers,
  dropOverlayDragState,
  callbacks: {
    switchTab,
    moveTab,
    closeTab,
    setStatus,
    render,
    hasTabSession,
    normalizeTransferTab,
    snapshotActiveFileAsTransferTab,
    syncActiveTabToState,
    saveNow,
    openFileAsTab,
    openEntry,
    openFolderEntryInTabs,
    updateMenuState,
    markSidebarTreeDirty,
    clearActiveFile,
    flushStateToActiveTab,
    snapshotAllOpenTabsForTransfer,
    openFile,
    applyFilePayload,
    setDropOverlayVisible,
    handleDroppedPaths,
    openSingleFileFromUi,
    openFolder,
    handleOsOpenFiles,
    handleProjectFolderChanged,
    handleProjectFileChanged,
    toggleSidebarVisibility,
    toggleMarkdownMode,
    closeActiveFileOrWindow,
    closeTabByPath,
    createNewTab,
    handleRequestExportAllTabs,
    handleReceiveTransferredTabs,
    handleTabTransferResult,
    restoreLastSession,
    onFileSaved,
    onBeforeToggleMarkdownMode,
    onAfterToggleMarkdownMode,
    onSavedStateChanged: renderChrome,
  },
}));

function applySavedTheme() {
  const saved = localStorage.getItem("teex-theme");
  if (saved === "light" || saved === "dark") {
    document.documentElement.setAttribute("data-theme", saved);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  applySavedTheme();
  bindElements();
  scrollSyncController = createScrollSyncController({ state, el });
  bindUiEvents();
  await bindAppEvents();
  await bootstrap();
  sessionSaveEnabled = true;
  startPendingOpenPathPoller();

  const savedTheme = localStorage.getItem("teex-theme");
  if (savedTheme) {
    invoke("set_theme", { theme: savedTheme }).catch(() => {});
  }

  listen("teex://set-theme", (event) => {
    const theme = event.payload;
    localStorage.setItem("teex-theme", theme);
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  });
});

function bindElements() {
  return bindElementsImported(el);
}

function bindUiEvents() {
  return bindUiEventsImported({
    state,
    el,
    invoke,
    setStatus,
    toggleMarkdownMode,
    toggleSidebarVisibility,
    saveNow,
    hasTabSession,
    switchTab,
    onEditorScroll: () => scrollSyncController?.onEditorScroll(),
    onPreviewScroll: () => scrollSyncController?.onPreviewScroll(),
    onDirtyStateChanged: () => renderChrome(),
  });
}

function markSidebarTreeDirty() {
  sidebarController.markTreeDirty();
}

async function bindAppEvents() {
  await appEventsController.bindAppEvents();
}

async function bindWindowDragDropEvents() {
  return dragDropController.bindWindowDragDropEvents();
}

async function bootstrap() {
  await openPathsController.bootstrap();
}

async function drainPendingOpenPaths() {
  return openPathsController.drainPendingOpenPaths();
}

async function handleOsOpenFiles(paths) {
  await openPathsController.handleOsOpenFiles(paths);
}

async function handleProjectFolderChanged() {
  await fileController.refreshOpenFolderEntries();
}

async function handleProjectFileChanged(path) {
  if (typeof path !== "string" || !path) {
    return;
  }

  const savedAt = externalFileWatchState.recentlySavedAtByPath.get(path);
  if (savedAt && Date.now() - savedAt < 1200) {
    return;
  }

  if (externalFileWatchState.handlingChangedPaths.has(path)) {
    return;
  }

  externalFileWatchState.handlingChangedPaths.add(path);
  try {
    await reloadExternallyChangedFile(path);
  } finally {
    externalFileWatchState.handlingChangedPaths.delete(path);
  }
}

async function handleDroppedPaths(paths) {
  await openPathsController.handleDroppedPaths(paths);
}

function setDropOverlayVisible(visible) {
  if (!el.dropOverlay || state.dropOverlayVisible === visible) {
    return;
  }

  state.dropOverlayVisible = visible;
  el.dropOverlay.classList.toggle("hidden", !visible);
}

function startPendingOpenPathPoller() {
  openPathsController.startPendingOpenPathPoller();
}

async function openFile(path) {
  scrollSyncController?.beforeContextReplace();
  await fileController.openFile(path);
}

async function openSingleFileFromUi(path) {
  await fileController.openSingleFileFromUi(path);
}

async function openFolder(path) {
  scrollSyncController?.beforeContextReplace();
  await fileController.openFolder(path);
}

async function openEntry(path) {
  await fileController.openEntry(path);
}

async function openFolderEntryInTabs(path) {
  await fileController.openFolderEntryInTabs(path);
}

function applyFilePayload(payload, options) {
  scrollSyncController?.beforeApplyFilePayload();
  applyFilePayloadToState(state, payload, options);
  scrollSyncController?.afterApplyFilePayload(payload.path);
}

function clearActiveFile() {
  clearActiveFileInState(state);
}

function flushStateToActiveTab() {
  flushStateToActiveTabInState(state);
}

function syncActiveTabToState() {
  syncActiveTabToStateFromTabs(state);
}

function normalizeTransferTab(rawTab) {
  return normalizeTransferTabRecord(rawTab);
}

function snapshotActiveFileAsTransferTab() {
  return snapshotActiveFileTransfer(state);
}

function snapshotAllOpenTabsForTransfer() {
  return snapshotAllTransfers(state);
}

async function handleRequestExportAllTabs(payload) {
  await tabTransferController.handleRequestExportAllTabs(payload);
}

async function handleReceiveTransferredTabs(payload) {
  await tabTransferController.handleReceiveTransferredTabs(payload);
}

async function handleTabTransferResult(payload) {
  await tabTransferController.handleTabTransferResult(payload);
}

async function restoreLastSession() {
  const sessions = loadAllSessions();
  if (sessions.length === 0) {
    return;
  }

  clearAllSessions();

  await restoreSessionInCurrentWindow(sessions[0]);

  for (let i = 1; i < sessions.length; i++) {
    const paths = sessionPaths(sessions[i]);
    if (paths.length > 0) {
      await invoke("open_paths_in_new_window", { paths });
    }
  }
}

async function restoreSessionInCurrentWindow(session) {
  if (session.mode === "folder" && session.folderPath) {
    await openFolder(session.folderPath);
    return;
  }

  const paths = sessionPaths(session);
  if (!paths.length) {
    return;
  }

  if (paths.length === 1) {
    await openFile(paths[0]);
  } else {
    await openMultipleFiles(paths);
    const targetIndex = session.activeTabIndex ?? 0;
    if (targetIndex > 0 && targetIndex < state.openFiles.length) {
      switchTab(targetIndex);
    }
  }
}

function sessionPaths(session) {
  if (session.mode === "folder" && session.folderPath) {
    return [session.folderPath];
  }
  return (session.tabs ?? []).map((t) => t.path).filter(Boolean);
}

function pruneStaleWindowsAsync() {
  invoke("get_all_window_labels")
    .then((labels) => pruneStaleWindows(labels))
    .catch(() => {});
}

async function openMultipleFiles(paths) {
  scrollSyncController?.beforeContextReplace();
  await tabController.openMultipleFiles(paths);
}

async function openFileAsTab(path) {
  await tabController.openFileAsTab(path);
}

async function openFileInTabs(path) {
  await tabController.openFileInTabs(path);
}

function switchTab(index) {
  tabController.switchTab(index);
}

function moveTab(fromIndex, toIndex) {
  tabController.moveTab(fromIndex, toIndex);
}

async function closeTab(index) {
  await tabController.closeTab(index);
  if (!state.activePath) {
    scrollSyncController?.afterContextCleared();
  }
}

async function closeTabByPath(path) {
  if (hasTabSession()) {
    const index = findOpenTabIndexByPath(path);
    if (index !== -1) {
      await closeTab(index);
    }
  } else if (state.activePath === path) {
    await closeSingleActiveFile();
  }
}

async function closeSingleActiveFile() {
  await tabController.closeSingleActiveFile();
  scrollSyncController?.afterContextCleared();
}

async function closeActiveFileOrWindow() {
  await tabController.closeActiveFileOrWindow();
}

function createNewTab() {
  tabController.createNewTab();
}

function toggleMarkdownMode() {
  editorController.toggleMarkdownMode();
}

function onBeforeToggleMarkdownMode() {
  scrollSyncController?.captureMarkdownToggleAnchor();
}

function onAfterToggleMarkdownMode() {
  // post-render scroll restoration is centralized in render()
}

function toggleSidebarVisibility() {
  editorController.toggleSidebarVisibility();
}

async function saveNow() {
  await editorController.saveNow();
}

function isEditable() {
  return editorController.isEditable();
}

function hasTabSession() {
  return hasTabSessionInState(state);
}

function updateMenuState() {
  editorController.updateMenuState();
}

function render(options = {}) {
  uiRenderer.render(options);
  scrollSyncController?.scheduleRestoreAfterRender();
  syncWatchedProjectFiles();
  if (sessionSaveEnabled) {
    flushStateToActiveTab();
    saveWindowSession(state, state.windowLabel);
    pruneStaleWindowsAsync();
  }
}

function renderChrome() {
  uiRenderer.renderChrome();
}

function setStatus(message, isError = false) {
  if (isError) {
    console.error(message);
  }
}

function onFileSaved(path) {
  if (typeof path !== "string" || !path) {
    return;
  }
  externalFileWatchState.recentlySavedAtByPath.set(path, Date.now());
  setTimeout(() => {
    const savedAt = externalFileWatchState.recentlySavedAtByPath.get(path);
    if (savedAt && Date.now() - savedAt >= 1200) {
      externalFileWatchState.recentlySavedAtByPath.delete(path);
    }
  }, 1500);
}

function collectWatchedProjectFilePaths() {
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

function buildWatchedProjectFileSignature(paths) {
  return paths.join("\n");
}

function syncWatchedProjectFiles() {
  const paths = collectWatchedProjectFilePaths();
  const signature = buildWatchedProjectFileSignature(paths);

  if (externalFileWatchState.signature === signature && !externalFileWatchState.pendingSync) {
    return;
  }

  externalFileWatchState.signature = signature;

  if (externalFileWatchState.syncPromise) {
    externalFileWatchState.pendingSync = true;
    return;
  }

  externalFileWatchState.syncPromise = (async () => {
    try {
      await invoke("watch_project_files", { paths });
    } catch (error) {
      setStatus(String(error), true);
    }
  })().finally(() => {
    externalFileWatchState.syncPromise = null;
    if (externalFileWatchState.pendingSync) {
      externalFileWatchState.pendingSync = false;
      syncWatchedProjectFiles();
    }
  });
}

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
  const activePath = state.activePath;
  const isActive = activePath === path;
  const isDirty = hasTabs ? isOpenTabDirtyForPath(path) : isActiveFileDirtyForPath(path);

  if (isDirty) {
    if (isActive) {
      const confirmed = await confirmReloadExternalChange(baseName(path));
      if (!confirmed) {
        setStatus(`External change detected for ${baseName(path)} (kept local edits)`, true);
        return;
      }
    } else {
      setStatus(`External change detected for dirty tab ${baseName(path)}`, true);
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
