import { shouldSuppressDropOverlayForSelfHover } from "./ui/behavior.js";
import { baseName, clamp } from "./app-utils.js";
import { extractDragDropPaths, hasFileDragData } from "./path-input.js";
import { createSidebarController } from "./sidebar/controller.js";
import { createUiRenderer } from "./ui/renderer.js";
import { createEditorController } from "./ui/editor-controller.js";
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
import { createTabTransferController } from "./tabs/transfer-controller.js";
import { createTabController } from "./tabs/controller.js";
import { createFileController } from "./files/controller.js";
import {
  createOpenPathsController,
} from "./app/open-paths-controller.js";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const EVENTS = {
  openFileSelected: "teex://open-file-selected",
  openFolderSelected: "teex://open-folder-selected",
  osOpenPaths: "teex://os-open-paths",
  toggleSidebar: "teex://toggle-sidebar",
  toggleMarkdownMode: "teex://toggle-markdown-mode",
  closeActiveFile: "teex://close-active-file",
  requestExportAllTabs: "teex://request-export-all-tabs",
  receiveTransferredTabs: "teex://receive-transferred-tabs",
  tabTransferResult: "teex://tab-transfer-result",
};

const state = {
  mode: "empty",
  sidebarVisible: false,
  sidebarWidth: 280,
  dropOverlayVisible: false,
  collapsedFolders: new Set(),
  rootPath: null,
  entries: [],
  openFiles: [],
  activeTabIndex: 0,
  activePath: null,
  activeKind: null,
  content: "",
  markdownViewMode: "preview",
  isDirty: false,
  isSaving: false,
  saveTimer: null,
  windowTitle: "",
  windowRepresentedPath: null,
  windowLabel: "",
};

const el = {};
const sidebarRenderState = {
  treeDirty: true,
  activePath: null,
};
const sidebarClickState = {
  lastPath: null,
  previousSingleTab: null,
  openPromise: Promise.resolve(),
};
const osOpenDeduper = {
  signature: "",
  timestamp: 0,
};
const pendingOutgoingTabTransfers = new Map();
const dropOverlayDragState = {
  suppressOverlay: false,
};
let sidebarController;
let uiRenderer;
let tabTransferController;
let tabController;
let fileController;
let editorController;
let openPathsController;

uiRenderer = createUiRenderer({
  state,
  el,
  invoke,
  renderSidebar: () => sidebarController.renderSidebar(),
  switchTab,
  closeTab,
});

editorController = createEditorController({
  state,
  invoke,
  setStatus,
  render,
  hasTabSession,
});

sidebarController = createSidebarController({
  state,
  el,
  sidebarRenderState,
  sidebarClickState,
  normalizeTransferTab,
  snapshotActiveFileAsTransferTab,
  hasTabSession,
  syncActiveTabToState,
  saveNow,
  openFileAsTab,
  openEntry,
  openFolderEntryInTabs,
  render: () => uiRenderer.render(),
  updateMenuState,
});

tabTransferController = createTabTransferController({
  state,
  pendingOutgoingTabTransfers,
  invoke,
  setStatus,
  markSidebarTreeDirty,
  render,
  updateMenuState,
  hasTabSession,
  clearActiveFile,
  flushStateToActiveTab,
  syncActiveTabToState,
  normalizeTransferTab,
  snapshotActiveFileAsTransferTab,
  snapshotAllOpenTabsForTransfer,
});

tabController = createTabController({
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
});

fileController = createFileController({
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
  openFileAsTab: (path) => tabController.openFileAsTab(path),
  openFileInTabs: (path) => tabController.openFileInTabs(path),
});

openPathsController = createOpenPathsController({
  state,
  invoke,
  setStatus,
  render,
  updateMenuState,
  openFile: (path) => fileController.openFile(path),
  openFileInTabs: (path) => tabController.openFileInTabs(path),
  openSingleFileFromUi: (path) => fileController.openSingleFileFromUi(path),
  openMultipleFiles: (paths) => tabController.openMultipleFiles(paths),
  openFolder: (path) => fileController.openFolder(path),
  deduper: osOpenDeduper,
});

window.addEventListener("DOMContentLoaded", async () => {
  bindElements();
  bindUiEvents();
  await bindAppEvents();
  await bootstrap();
  startPendingOpenPathPoller();
});

function bindElements() {
  el.workspace = document.querySelector("#workspace");
  el.sidebar = document.querySelector("#sidebar");
  el.sidebarResizer = document.querySelector("#sidebar-resizer");
  el.dropOverlay = document.querySelector("#drop-overlay");
  el.projectRoot = document.querySelector("#project-root");
  el.projectList = document.querySelector("#project-list");
  el.tabBar = document.querySelector("#tab-bar");
  el.emptyState = document.querySelector("#empty-state");
  el.editorState = document.querySelector("#editor-state");
  el.editor = document.querySelector("#editor");
  el.preview = document.querySelector("#preview");
}

function bindUiEvents() {
  window.addEventListener("dragover", (event) => {
    if (hasFileDragData(event)) {
      event.preventDefault();
    }
  });

  window.addEventListener("drop", (event) => {
    if (hasFileDragData(event)) {
      event.preventDefault();
    }
  });

  el.editor.addEventListener("input", (event) => {
    state.content = event.target.value;
    state.isDirty = true;
    setStatus("Saving...");
    scheduleAutosave();
  });

  document.addEventListener("keydown", async (event) => {
    if (event.metaKey && event.key.toLowerCase() === "e") {
      event.preventDefault();
      toggleMarkdownMode();
    }

    if (event.metaKey && event.code === "Backslash") {
      event.preventDefault();
      toggleSidebarVisibility();
    }

    if (event.metaKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      await saveNow();
    }

    if (event.metaKey && /^[1-9]$/.test(event.key)) {
      const index = parseInt(event.key, 10) - 1;
      if (hasTabSession() && index < state.openFiles.length) {
        event.preventDefault();
        switchTab(index);
      }
    }
  });

  el.preview.addEventListener("click", (event) => {
    const link = event.target.closest("a[href]");
    if (!link) {
      return;
    }
    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noreferrer noopener");
  });

  window.addEventListener("focus", () => {
    invoke("notify_window_focused").catch(() => {});
  });

  window.addEventListener("pointerdown", () => {
    invoke("notify_window_focused").catch(() => {});
  }, { capture: true });

  el.sidebarResizer.addEventListener("pointerdown", (event) => {
    if (state.mode !== "folder" || !state.sidebarVisible) {
      return;
    }

    event.preventDefault();
    const workspaceRect = el.workspace.getBoundingClientRect();

    const onMove = (moveEvent) => {
      const rawWidth = moveEvent.clientX - workspaceRect.left;
      const maxWidth = Math.max(220, Math.floor(workspaceRect.width * 0.65));
      state.sidebarWidth = clamp(rawWidth, 180, maxWidth);
      el.workspace.style.setProperty("--sidebar-width", `${state.sidebarWidth}px`);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
}

function markSidebarTreeDirty() {
  sidebarController.markTreeDirty();
}

async function bindAppEvents() {
  const label = await invoke("get_window_label");
  state.windowLabel = label;
  await Promise.all([
    listen(`${EVENTS.openFileSelected}/${label}`, async (event) => {
      await openSingleFileFromUi(event.payload);
    }),
    listen(`${EVENTS.openFolderSelected}/${label}`, async (event) => {
      await openFolder(event.payload);
    }),
    listen(`${EVENTS.osOpenPaths}/${label}`, async (event) => {
      await handleOsOpenFiles(event.payload);
    }),
    listen(`${EVENTS.toggleSidebar}/${label}`, () => {
      toggleSidebarVisibility();
    }),
    listen(`${EVENTS.toggleMarkdownMode}/${label}`, () => {
      toggleMarkdownMode();
    }),
    listen(`${EVENTS.closeActiveFile}/${label}`, async () => {
      await closeActiveFileOrWindow();
    }),
    listen(`${EVENTS.requestExportAllTabs}/${label}`, async (event) => {
      await handleRequestExportAllTabs(event.payload);
    }),
    listen(`${EVENTS.receiveTransferredTabs}/${label}`, async (event) => {
      await handleReceiveTransferredTabs(event.payload);
    }),
    listen(`${EVENTS.tabTransferResult}/${label}`, async (event) => {
      await handleTabTransferResult(event.payload);
    }),
    bindWindowDragDropEvents(),
  ]);
}

async function bindWindowDragDropEvents() {
  const tauriWindowApi = window.__TAURI__?.window;
  const getCurrentWindow = tauriWindowApi?.getCurrentWindow;

  if (typeof getCurrentWindow === "function") {
    const currentWindow = getCurrentWindow();
    if (typeof currentWindow?.onDragDropEvent === "function") {
      return currentWindow.onDragDropEvent(async (event) => {
        const dragEvent = event?.payload;
        if (!dragEvent || typeof dragEvent.type !== "string") {
          return;
        }

        if (dragEvent.type === "enter") {
          dropOverlayDragState.suppressOverlay = shouldSuppressDropOverlayForSelfHover({
            paths: extractDragDropPaths(dragEvent),
            activePath: state.activePath,
            rootPath: state.rootPath,
          });
          if (!dropOverlayDragState.suppressOverlay) {
            setDropOverlayVisible(true);
          }
          return;
        }

        if (dragEvent.type === "over") {
          if (!dropOverlayDragState.suppressOverlay) {
            setDropOverlayVisible(true);
          }
          return;
        }

        if (dragEvent.type === "leave") {
          dropOverlayDragState.suppressOverlay = false;
          setDropOverlayVisible(false);
          return;
        }

        if (dragEvent.type === "drop") {
          const paths = extractDragDropPaths(dragEvent);
          dropOverlayDragState.suppressOverlay = false;
          setDropOverlayVisible(false);
          if (shouldSuppressDropOverlayForSelfHover({
            paths,
            activePath: state.activePath,
            rootPath: state.rootPath,
          })) {
            return;
          }
          await handleDroppedPaths(paths);
        }
      });
    }
  }

  // Fallback for runtimes that only expose the legacy global drag events.
  const unlisteners = await Promise.all([
    listen("tauri://drag-enter", (event) => {
      const paths = extractDragDropPaths(event.payload);
      dropOverlayDragState.suppressOverlay = shouldSuppressDropOverlayForSelfHover({
        paths,
        activePath: state.activePath,
        rootPath: state.rootPath,
      });
      if (paths.length > 0 && !dropOverlayDragState.suppressOverlay) {
        setDropOverlayVisible(true);
      }
    }),
    listen("tauri://drag-over", () => {
      if (!dropOverlayDragState.suppressOverlay) {
        setDropOverlayVisible(true);
      }
    }),
    listen("tauri://drag-leave", () => {
      dropOverlayDragState.suppressOverlay = false;
      setDropOverlayVisible(false);
    }),
    listen("tauri://drag-drop", async (event) => {
      const paths = extractDragDropPaths(event.payload);
      dropOverlayDragState.suppressOverlay = false;
      setDropOverlayVisible(false);
      if (shouldSuppressDropOverlayForSelfHover({
        paths,
        activePath: state.activePath,
        rootPath: state.rootPath,
      })) {
        return;
      }
      await handleDroppedPaths(paths);
    }),
  ]);

  return () => {
    for (const unlisten of unlisteners) {
      if (typeof unlisten === "function") {
        unlisten();
      }
    }
  };
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
