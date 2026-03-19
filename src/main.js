import { setupControllers } from "./app/controller-setup.js";
import { createExternalFileWatchController } from "./app/external-file-watch-controller.js";
import { createRuntimeState, EVENTS } from "./app/runtime-state.js";
import {
  clearAllSessions,
  loadAllSessions,
  pruneStaleWindows,
  saveWindowSession,
} from "./app/session-persistence.js";
import { createSessionRestoreController } from "./app/session-restore.js";
import { loadSidebarWidth } from "./app/sidebar-width-persistence.js";
import { baseName } from "./app-utils.js";
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
import { createCodeJarController } from "./ui/codejar-controller.js";
import {
  confirmDelete,
  confirmReloadExternalChange,
} from "./ui/native-dialog.js";
import { createScrollSyncController } from "./ui/scroll-sync.js";

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
let externalFileWatchController;
let sessionRestoreController;
let findController;
let sessionSaveEnabled = false;

const codeJarController = createCodeJarController({
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
    closeActiveFileOrWindow,
    closeTabByPath,
    createNewTab,
    handleRequestExportAllTabs,
    handleReceiveTransferredTabs,
    handleTabTransferResult,
    restoreLastSession,
    handleContextMenuDelete,
    onFileSaved,
    onBeforeToggleMarkdownMode,
    onAfterToggleMarkdownMode,
    onSavedStateChanged: renderChrome,
    openFind,
    navigateBack,
    navigateForward,
  },
}));

function openFind() {
  findController?.open();
}

function applySavedTheme() {
  const saved = localStorage.getItem("teex-theme");
  if (saved === "light" || saved === "dark") {
    document.documentElement.setAttribute("data-theme", saved);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

function applySavedSidebarWidth() {
  state.sidebarWidth = loadSidebarWidth();
}

function applySavedStatusBar() {
  state.statusBarVisible = localStorage.getItem("teex-status-bar") === "true";
}

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
  applySavedSidebarWidth();
  applySavedStatusBar();
  bindElements();
  findController = createFindController({ state, el, codeJarController });
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
    toggleStatusBar,
    toggleCollapseAllFolders: () =>
      sidebarController.toggleCollapseAllFolders(),
    expandAllFolders: () => sidebarController.expandAllFolders(),
    saveNow,
    hasTabSession,
    switchTab,
    navigateBack,
    navigateForward,
    onEditorScroll: () => scrollSyncController?.onEditorScroll(),
    onPreviewScroll: () => scrollSyncController?.onPreviewScroll(),
    onDirtyStateChanged: () => renderChrome(),
    openFind,
  });
}

function markSidebarTreeDirty() {
  sidebarController.markTreeDirty();
}

async function bindAppEvents() {
  await appEventsController.bindAppEvents();
}

async function _bindWindowDragDropEvents() {
  return dragDropController.bindWindowDragDropEvents();
}

async function bootstrap() {
  await openPathsController.bootstrap();
}

async function _drainPendingOpenPaths() {
  return openPathsController.drainPendingOpenPaths();
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

function startPendingOpenPathPoller() {
  openPathsController.startPendingOpenPathPoller();
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

async function _openFileInTabs(path) {
  await tabController.openFileInTabs(path);
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
    const index = findOpenTabIndexByPath(path);
    if (index !== -1) {
      await closeTab(index);
    }
  } else if (state.activePath === path) {
    await closeSingleActiveFile();
  }
}

async function handleContextMenuDelete(path) {
  const fileName = baseName(path);
  const confirmed = await confirmDelete(fileName);
  if (!confirmed) {
    return;
  }
  try {
    await invoke("trash_file", { path });
    await closeTabByPath(path);
  } catch (err) {
    console.error("Failed to move file to trash:", err);
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
  findController?.refresh();
}

function toggleStatusBar() {
  state.statusBarVisible = !state.statusBarVisible;
  localStorage.setItem(
    "teex-status-bar",
    state.statusBarVisible ? "true" : "false",
  );
  render();
}

function toggleSidebarVisibility() {
  editorController.toggleSidebarVisibility();
}

async function saveNow() {
  await editorController.saveNow();
}

function _isEditable() {
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
  externalFileWatchController.syncWatchedProjectFiles();
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
}
