import { setupControllers } from "./app/controller-setup.js";
import { createExternalFileWatchController } from "./app/external-file-watch-controller.js";
import {
  applySavedModifiedOnly,
  applySavedShowHiddenFiles,
  applySavedSidebarWidth,
  applySavedStatusBar,
  applySavedTheme,
  listenForThemeEvents,
  syncSavedPreferencesToBackend,
  toggleHiddenFiles as toggleHiddenFilesPref,
  toggleModifiedOnly as toggleModifiedOnlyPref,
  toggleStatusBar as toggleStatusBarPref,
} from "./app/preferences.js";
import { createRuntimeState, EVENTS } from "./app/runtime-state.js";
import {
  clearAllSessions,
  loadAllSessions,
  pruneStaleWindows,
  saveWindowSession,
} from "./app/session-persistence.js";
import { createSessionRestoreController } from "./app/session-restore.js";
import { createFindController } from "./search/find-controller.js";
import { buildCollapsedFoldersFromExpanded } from "./sidebar/tree.js";
import { recordNavigation } from "./tabs/navigation.js";
import {
  applyFilePayloadToState,
  clearActiveFileInState,
  flushStateToActiveTabInState,
  hasTabSession as hasTabSessionInState,
  normalizeTransferTab as normalizeTransferTabRecord,
  reconcileRestoredFolderTabs,
  snapshotActiveFileAsTransferTab as snapshotActiveFileTransfer,
  snapshotAllOpenTabsForTransfer as snapshotAllTransfers,
  syncActiveTabToStateFromTabs,
} from "./tabs/session.js";
import {
  bindElements as bindElementsImported,
  bindUiEvents as bindUiEventsImported,
} from "./ui/bindings-controller.js";
import { createDiffController } from "./ui/diff/controller.js";
import { createDiffMapController } from "./ui/diff/map-controller.js";
import { createUnifiedDiffController } from "./ui/diff/unified-controller.js";
import { createCodeMirrorController } from "./ui/editor/codemirror-controller.js";
import { createFormatController } from "./ui/format-controller.js";
import { confirmReloadExternalChange } from "./ui/native-dialog.js";
import { createScrollSyncController } from "./ui/scroll/sync.js";
import { baseName } from "./utils/app-utils.js";

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
let appEventsController;
let scrollSyncController;
let externalFileWatchController;
let sessionRestoreController;
let findController;
let formatController;
let diffController;
let diffMapController;
let unifiedDiffController;
let sessionSaveEnabled = false;

const codeJarController = createCodeMirrorController({
  el,
  state,
  onContentChange: () => renderChrome(),
  onScroll: () => scrollSyncController?.onEditorScroll(),
});

({
  sidebarController,
  uiRenderer,
  editorController,
  tabTransferController,
  tabController,
  fileController,
  openPathsController,
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
  codeJarController,
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
    toggleStatusBar,
    toggleCollapseAllFolders: () =>
      sidebarController.toggleCollapseAllFolders(),
    closeActiveFileOrWindow,
    closeTabByPath,
    createNewTab,
    handleRequestExportAllTabs,
    handleReceiveTransferredTabs,
    handleTabTransferResult,
    restoreLastSession,
    handleContextMenuDelete: (path) =>
      tabController.deleteAndCloseTabs(path, {
        onAllClosed: () => scrollSyncController?.afterContextCleared(),
      }),
    handleTabContextMenuClose: closeTab,
    handleTabContextMenuCloseOthers: (index) =>
      tabController.closeOtherTabs(index),
    onFileSaved,
    onBeforeToggleMarkdownMode,
    onAfterToggleMarkdownMode,
    onSavedStateChanged: renderChrome,
    openFind,
    formatActiveFile,
    navigateBack,
    navigateForward,
  },
}));

sessionRestoreController = createSessionRestoreController({
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
});

externalFileWatchController = createExternalFileWatchController({
  state,
  invoke,
  baseName,
  hasTabSession,
  applyFilePayload,
  render,
  updateMenuState,
  setStatus,
  confirmReloadExternalChange,
});

window.addEventListener("DOMContentLoaded", async () => {
  applySavedTheme();
  applySavedSidebarWidth(state);
  applySavedStatusBar(state);
  applySavedShowHiddenFiles(state);
  applySavedModifiedOnly(state);
  bindElementsImported(el);
  invoke("get_folder_icon")
    .then((url) => {
      if (url) state.folderIconUrl = url;
    })
    .catch(() => {});
  findController = createFindController({
    state,
    el,
    codeEditorController: codeJarController,
  });
  formatController = createFormatController({
    state,
    invoke,
    codeEditorController: codeJarController,
    onDirtyStateChanged: () => renderChrome(),
  });
  diffMapController = createDiffMapController({
    el,
    codeEditorController: codeJarController,
  });
  diffController = createDiffController({
    state,
    invoke,
    codeEditorController: codeJarController,
    diffMapController,
  });
  unifiedDiffController = createUnifiedDiffController({ state, el, invoke });
  scrollSyncController = createScrollSyncController({ state, el });
  bindUiEvents();
  await Promise.all([
    appEventsController.bindAppEvents(),
    openPathsController.bootstrap(),
  ]);
  sessionSaveEnabled = true;
  openPathsController.startPendingOpenPathPoller();

  syncSavedPreferencesToBackend(state, invoke);
  listenForThemeEvents(listen);

  listen("teex://toggle-hidden-files", () => toggleHiddenFiles());
  listen("teex://toggle-modified-only", () => toggleModifiedOnly());
  listen("teex://toggle-unified-diff", () => toggleUnifiedDiff());
});

function bindUiEvents() {
  return bindUiEventsImported({
    state,
    el,
    invoke,
    setStatus,
    toggleMarkdownMode,
    toggleSidebarVisibility,
    toggleStatusBar,
    toggleModifiedOnly,
    toggleCollapseAllFolders: () =>
      sidebarController.toggleCollapseAllFolders(),
    toggleUnifiedDiff,
    saveNow,
    hasTabSession,
    switchTab,
    navigateBack,
    navigateForward,
    onEditorScroll: () => scrollSyncController?.onEditorScroll(),
    onPreviewScroll: () => scrollSyncController?.onPreviewScroll(),
    onDirtyStateChanged: () => renderChrome(),
    openFind,
    formatActiveFile,
  });
}

function openFind() {
  findController?.open();
}

function formatActiveFile() {
  formatController?.formatActiveFile();
}

function markSidebarTreeDirty() {
  sidebarController.markTreeDirty();
}

async function handleOsOpenFiles(paths) {
  await openPathsController.handleOsOpenFiles(paths);
}

async function handleProjectFolderChanged() {
  await fileController.refreshOpenFolderEntries();
}

async function handleProjectFileChanged(path) {
  await externalFileWatchController.handleProjectFileChanged(path);
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

async function openFile(path) {
  findController?.close();
  scrollSyncController?.beforeContextReplace();
  await fileController.openFile(path);
  invoke("add_recent_file", { path }).catch(() => {});
}

async function openSingleFileFromUi(path) {
  await fileController.openSingleFileFromUi(path);
}

async function openFolder(path) {
  scrollSyncController?.beforeContextReplace();
  await fileController.openFolder(path);
  invoke("add_recent_folder", { path }).catch(() => {});
  if (!hasTabSession() && state.activePath) {
    recordNavigation(state, state.activePath);
    renderChrome();
  }
}

async function openEntry(path) {
  await fileController.openEntry(path);
  if (!hasTabSession() && state.activePath) {
    recordNavigation(state, state.activePath);
    renderChrome();
  }
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
  await sessionRestoreController.restoreLastSession();
}

function pruneStaleWindowsAsync() {
  sessionRestoreController.pruneStaleWindowsAsync();
}

async function openMultipleFiles(paths) {
  scrollSyncController?.beforeContextReplace();
  await tabController.openMultipleFiles(paths);
  for (const path of paths) {
    invoke("add_recent_file", { path }).catch(() => {});
  }
}

async function openFileAsTab(path) {
  await tabController.openFileAsTab(path);
  invoke("add_recent_file", { path }).catch(() => {});
}

function navigateBack() {
  tabController.navigateBack();
}

function navigateForward() {
  tabController.navigateForward();
}

function switchTab(index) {
  findController?.close();
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
    const index = state.openFiles.findIndex((t) => t.path === path);
    if (index !== -1) {
      await closeTab(index);
    }
  } else if (state.activePath === path) {
    await tabController.closeSingleActiveFile();
    scrollSyncController?.afterContextCleared();
  }
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
  findController?.refresh();
}

function toggleStatusBar() {
  toggleStatusBarPref(state, render);
}

function toggleHiddenFiles() {
  toggleHiddenFilesPref(state, invoke, () =>
    fileController.refreshOpenFolderEntries(),
  );
}

function toggleModifiedOnly() {
  toggleModifiedOnlyPref(state, invoke, markSidebarTreeDirty, render);
}

function toggleUnifiedDiff() {
  if (state.mode !== "folder") {
    return;
  }
  const existingIdx = state.openFiles.findIndex((t) => t.kind === "diff");
  if (existingIdx !== -1) {
    if (hasTabSession() && state.activeTabIndex === existingIdx) {
      tabController.closeTab(existingIdx);
    } else {
      switchTab(existingIdx);
      unifiedDiffController?.refreshNow();
    }
  } else {
    tabController.openDiffTab();
    unifiedDiffController?.refreshNow();
  }
}

function updateUnifiedDiffButton() {
  if (el.unifiedDiffBtn) {
    const active = state.activeKind === "diff";
    el.unifiedDiffBtn.setAttribute("aria-pressed", String(active));
    el.unifiedDiffBtn.classList.toggle("active", active);
  }
}

function toggleSidebarVisibility() {
  editorController.toggleSidebarVisibility();
}

async function saveNow() {
  await editorController.saveNow();
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
  externalFileWatchController.syncWatchedProjectFiles();
  if (state.activeKind === "diff") {
    diffController?.clear();
    unifiedDiffController?.scheduleRefresh();
  } else {
    diffController?.refreshNow();
  }
  updateUnifiedDiffButton();
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
  externalFileWatchController.onFileSaved(path);
  diffController?.invalidate(path);
  diffController?.scheduleRefresh();
}
