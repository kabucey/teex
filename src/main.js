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
    toggleSidebarVisibility,
    toggleMarkdownMode,
    closeActiveFileOrWindow,
    handleRequestExportAllTabs,
    handleReceiveTransferredTabs,
    handleTabTransferResult,
  },
}));

window.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  bindUiEvents();
  await bindAppEvents();
  await bootstrap();
  startPendingOpenPathPoller();
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
    scheduleAutosave,
    toggleMarkdownMode,
    toggleSidebarVisibility,
    saveNow,
    hasTabSession,
    switchTab,
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
  await fileController.openFile(path);
}

async function openSingleFileFromUi(path) {
  await fileController.openSingleFileFromUi(path);
}

async function openFolder(path) {
  await fileController.openFolder(path);
}

async function openEntry(path) {
  await fileController.openEntry(path);
}

async function openFolderEntryInTabs(path) {
  await fileController.openFolderEntryInTabs(path);
}

function applyFilePayload(payload, options) {
  applyFilePayloadToState(state, payload, options);
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

async function openMultipleFiles(paths) {
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

async function closeTab(index) {
  await tabController.closeTab(index);
}

async function closeSingleActiveFile() {
  await tabController.closeSingleActiveFile();
}

async function closeActiveFileOrWindow() {
  await tabController.closeActiveFileOrWindow();
}

function toggleMarkdownMode() {
  editorController.toggleMarkdownMode();
}

function toggleSidebarVisibility() {
  editorController.toggleSidebarVisibility();
}

function scheduleAutosave() {
  editorController.scheduleAutosave(saveNow);
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

function render() {
  uiRenderer.render();
}

function setStatus(message, isError = false) {
  if (isError) {
    console.error(message);
  }
}
