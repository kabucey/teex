import { createSidebarController } from "../sidebar/controller.js";
import { createUiRenderer } from "../ui/renderer.js";
import { createEditorController } from "../ui/editor-controller.js";
import { createTabTransferController } from "../tabs/transfer-controller.js";
import { createTabController } from "../tabs/controller.js";
import { createFileController } from "../files/controller.js";
import { createOpenPathsController } from "./open-paths-controller.js";
import { createDragDropController } from "./drag-drop-controller.js";
import { createAppEventsController } from "./events-controller.js";

export function setupControllers({
  state,
  el,
  invoke,
  listen,
  baseName,
  events,
  sidebarRenderState,
  sidebarClickState,
  osOpenDeduper,
  pendingOutgoingTabTransfers,
  dropOverlayDragState,
  callbacks,
}) {
  let sidebarController;
  let uiRenderer;

  uiRenderer = createUiRenderer({
    state,
    el,
    invoke,
    renderSidebar: () => sidebarController.renderSidebar(),
    switchTab: callbacks.switchTab,
    closeTab: callbacks.closeTab,
  });

  const editorController = createEditorController({
    state,
    invoke,
    setStatus: callbacks.setStatus,
    render: callbacks.render,
    hasTabSession: callbacks.hasTabSession,
  });

  sidebarController = createSidebarController({
    state,
    el,
    sidebarRenderState,
    sidebarClickState,
    normalizeTransferTab: callbacks.normalizeTransferTab,
    snapshotActiveFileAsTransferTab: callbacks.snapshotActiveFileAsTransferTab,
    hasTabSession: callbacks.hasTabSession,
    syncActiveTabToState: callbacks.syncActiveTabToState,
    saveNow: callbacks.saveNow,
    openFileAsTab: callbacks.openFileAsTab,
    openEntry: callbacks.openEntry,
    openFolderEntryInTabs: callbacks.openFolderEntryInTabs,
    render: () => uiRenderer.render(),
    updateMenuState: callbacks.updateMenuState,
  });

  const tabTransferController = createTabTransferController({
    state,
    pendingOutgoingTabTransfers,
    invoke,
    setStatus: callbacks.setStatus,
    markSidebarTreeDirty: callbacks.markSidebarTreeDirty,
    render: callbacks.render,
    updateMenuState: callbacks.updateMenuState,
    hasTabSession: callbacks.hasTabSession,
    clearActiveFile: callbacks.clearActiveFile,
    flushStateToActiveTab: callbacks.flushStateToActiveTab,
    syncActiveTabToState: callbacks.syncActiveTabToState,
    normalizeTransferTab: callbacks.normalizeTransferTab,
    snapshotActiveFileAsTransferTab: callbacks.snapshotActiveFileAsTransferTab,
    snapshotAllOpenTabsForTransfer: callbacks.snapshotAllOpenTabsForTransfer,
  });

  const tabController = createTabController({
    state,
    invoke,
    baseName,
    setStatus: callbacks.setStatus,
    render: callbacks.render,
    updateMenuState: callbacks.updateMenuState,
    markSidebarTreeDirty: callbacks.markSidebarTreeDirty,
    saveNow: callbacks.saveNow,
    openFile: callbacks.openFile,
    applyFilePayload: callbacks.applyFilePayload,
    clearActiveFile: callbacks.clearActiveFile,
    hasTabSession: callbacks.hasTabSession,
    flushStateToActiveTab: callbacks.flushStateToActiveTab,
    syncActiveTabToState: callbacks.syncActiveTabToState,
  });

  const fileController = createFileController({
    state,
    invoke,
    baseName,
    saveNow: callbacks.saveNow,
    setStatus: callbacks.setStatus,
    render: callbacks.render,
    updateMenuState: callbacks.updateMenuState,
    markSidebarTreeDirty: callbacks.markSidebarTreeDirty,
    applyFilePayload: callbacks.applyFilePayload,
    clearActiveFile: callbacks.clearActiveFile,
    hasTabSession: callbacks.hasTabSession,
    openFileAsTab: (path) => tabController.openFileAsTab(path),
    openFileInTabs: (path) => tabController.openFileInTabs(path),
  });

  const openPathsController = createOpenPathsController({
    state,
    invoke,
    setStatus: callbacks.setStatus,
    render: callbacks.render,
    updateMenuState: callbacks.updateMenuState,
    openFile: (path) => fileController.openFile(path),
    openFileInTabs: (path) => tabController.openFileInTabs(path),
    openSingleFileFromUi: (path) => fileController.openSingleFileFromUi(path),
    openMultipleFiles: (paths) => tabController.openMultipleFiles(paths),
    openFolder: (path) => fileController.openFolder(path),
    deduper: osOpenDeduper,
  });

  const dragDropController = createDragDropController({
    state,
    listen,
    dropOverlayDragState,
    setDropOverlayVisible: callbacks.setDropOverlayVisible,
    handleDroppedPaths: callbacks.handleDroppedPaths,
  });

  const appEventsController = createAppEventsController({
    state,
    invoke,
    listen,
    events,
    openSingleFileFromUi: callbacks.openSingleFileFromUi,
    openFolder: callbacks.openFolder,
    handleOsOpenFiles: callbacks.handleOsOpenFiles,
    toggleSidebarVisibility: callbacks.toggleSidebarVisibility,
    toggleMarkdownMode: callbacks.toggleMarkdownMode,
    closeActiveFileOrWindow: callbacks.closeActiveFileOrWindow,
    handleRequestExportAllTabs: callbacks.handleRequestExportAllTabs,
    handleReceiveTransferredTabs: callbacks.handleReceiveTransferredTabs,
    handleTabTransferResult: callbacks.handleTabTransferResult,
    bindWindowDragDropEvents: () => dragDropController.bindWindowDragDropEvents(),
  });

  return {
    sidebarController,
    uiRenderer,
    editorController,
    tabTransferController,
    tabController,
    fileController,
    openPathsController,
    dragDropController,
    appEventsController,
  };
}
