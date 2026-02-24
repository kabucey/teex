import {
  getSingleFileUiOpenMode,
  getSidebarSelectedPath,
  shouldSidebarSingleClickOpenAsTab,
  shouldSidebarSingleClickIgnoreSamePath,
  shouldCapturePreviousSingleFolderFile,
  shouldCollapseHiddenSingleTabForSidebarOpen,
  shouldSuppressDropOverlayForSelfHover,
} from "./ui-behavior.js";

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
  sidebarRenderState.treeDirty = true;
  sidebarRenderState.activePath = null;
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
  setStatus("Ready");

  try {
    if (await drainPendingOpenPaths()) {
      return;
    }

    const launch = await invoke("get_launch_context");
    if (launch.mode === "file" && launch.path) {
      await openFile(launch.path);
      return;
    }

    if (launch.mode === "files" && launch.paths && launch.paths.length >= 2) {
      await openMultipleFiles(launch.paths);
      return;
    }

    if (launch.mode === "folder" && launch.path) {
      await openFolder(launch.path);
      return;
    }

    // Finder/macOS can deliver the open-file event slightly after initial startup.
    await sleep(250);
    if (await drainPendingOpenPaths()) {
      return;
    }
  } catch (error) {
    setStatus(String(error), true);
  }

  render();
  updateMenuState();
}

async function drainPendingOpenPaths() {
  const pendingOpenPaths = await invoke("take_pending_open_paths");
  if (!Array.isArray(pendingOpenPaths) || pendingOpenPaths.length === 0) {
    return false;
  }

  await handleOsOpenFiles(pendingOpenPaths);
  return true;
}

async function handleOsOpenFiles(paths) {
  const normalized = normalizeIncomingPaths(paths);
  if (normalized.length === 0) {
    return;
  }

  if (shouldSkipDuplicateOsOpen(normalized)) {
    return;
  }

  if (state.mode === "folder") {
    try {
      await invoke("open_paths_in_new_window", { paths: normalized });
    } catch (error) {
      setStatus(String(error), true);
    }
    return;
  }

  if (normalized.length >= 2) {
    await openMultipleFiles(normalized);
    return;
  }

  if (state.mode === "file" || state.mode === "files") {
    await openFileInTabs(normalized[0]);
    return;
  }

  await openFile(normalized[0]);
}

async function handleDroppedPaths(paths) {
  const normalized = normalizeIncomingPaths(paths);
  if (normalized.length === 0) {
    return;
  }

  try {
    const launch = await invoke("categorize_paths", { paths: normalized });
    if (!launch || !launch.mode) {
      return;
    }

    if (launch.mode === "folder" && launch.path) {
      await openFolder(launch.path);
      return;
    }

    if (launch.mode === "files" && Array.isArray(launch.paths) && launch.paths.length >= 2) {
      await openMultipleFiles(launch.paths);
      return;
    }

    if (launch.mode === "file" && launch.path) {
      await openSingleFileFromUi(launch.path);
      return;
    }

    setStatus("No supported files were dropped");
  } catch (error) {
    setStatus(String(error), true);
  }
}

function normalizeIncomingPaths(paths) {
  if (!Array.isArray(paths)) {
    return [];
  }

  return [...new Set(paths.filter((path) => typeof path === "string" && path.trim() !== ""))];
}

function extractDragDropPaths(payload) {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return normalizeIncomingPaths(payload);
  }

  if (Array.isArray(payload.paths)) {
    return normalizeIncomingPaths(payload.paths);
  }

  return [];
}

function setDropOverlayVisible(visible) {
  if (!el.dropOverlay || state.dropOverlayVisible === visible) {
    return;
  }

  state.dropOverlayVisible = visible;
  el.dropOverlay.classList.toggle("hidden", !visible);
}

function hasFileDragData(event) {
  const types = event?.dataTransfer?.types;
  if (!types) {
    return false;
  }

  return Array.from(types).includes("Files");
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function startPendingOpenPathPoller() {
  let attempts = 0;
  const maxAttempts = 20;

  const timer = setInterval(async () => {
    attempts += 1;
    try {
      await drainPendingOpenPaths();
    } catch (error) {
      setStatus(String(error), true);
    }

    if (attempts >= maxAttempts) {
      clearInterval(timer);
    }
  }, 150);
}

function shouldSkipDuplicateOsOpen(paths) {
  const signature = paths.join("\n");
  const now = Date.now();

  if (osOpenDeduper.signature === signature && now - osOpenDeduper.timestamp < 2000) {
    return true;
  }

  osOpenDeduper.signature = signature;
  osOpenDeduper.timestamp = now;
  return false;
}

async function openFile(path) {
  if (!path) {
    return;
  }

  await saveNow();

  try {
    const payload = await invoke("read_text_file", { path });
    state.mode = "file";
    state.sidebarVisible = false;
    state.rootPath = null;
    state.entries = [];
    markSidebarTreeDirty();
    state.openFiles = [];
    state.activeTabIndex = 0;
    applyFilePayload(payload, { defaultMarkdownMode: "preview" });
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

  try {
    const entries = await invoke("list_project_entries", { root: path });
    state.mode = "folder";
    state.rootPath = path;
    state.entries = entries;
    state.collapsedFolders = collectFolderPaths(entries);
    markSidebarTreeDirty();
    state.sidebarVisible = true;
    state.openFiles = [];
    state.activeTabIndex = 0;

    if (entries.length > 0) {
      const previous = state.activePath;
      const fallback = entries[0].path;
      const nextPath = entries.some((entry) => entry.path === previous) ? previous : fallback;
      await openEntry(nextPath);
    } else {
      clearActiveFile();
      setStatus("Folder has no text-like files");
      render();
    }
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

  state.openFiles = [{
    path: state.activePath,
    content: state.content,
    kind: state.activeKind,
    writable: true,
    isDirty: state.isDirty,
    markdownViewMode: state.markdownViewMode,
  }];
  state.activeTabIndex = 0;

  await openFileAsTab(path);
}

function applyFilePayload(payload, options) {
  const previousKind = state.activeKind;
  const previousMarkdownMode = state.markdownViewMode;

  state.activePath = payload.path;
  state.activeKind = payload.kind;
  state.content = payload.content;
  state.isDirty = false;
  clearTimeout(state.saveTimer);
  state.saveTimer = null;

  if (state.activeKind === "markdown") {
    state.markdownViewMode =
      previousKind === "markdown" ? previousMarkdownMode : options.defaultMarkdownMode;
  } else {
    state.markdownViewMode = "edit";
  }
}

function clearActiveFile() {
  state.activePath = null;
  state.activeKind = null;
  state.content = "";
  state.isDirty = false;
  state.markdownViewMode = "preview";
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
}

function flushStateToActiveTab() {
  if (!hasTabSession()) {
    return;
  }
  const tab = state.openFiles[state.activeTabIndex];
  if (!tab) {
    return;
  }
  tab.content = state.content;
  tab.isDirty = state.isDirty;
  tab.markdownViewMode = state.markdownViewMode;
}

function syncActiveTabToState() {
  if (!hasTabSession()) {
    return;
  }
  const tab = state.openFiles[state.activeTabIndex];
  if (!tab) {
    return;
  }
  state.activePath = tab.path;
  state.activeKind = tab.kind;
  state.content = tab.content;
  state.isDirty = tab.isDirty;
  state.markdownViewMode = tab.markdownViewMode;
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
}

function normalizeTransferTab(rawTab) {
  if (!rawTab || typeof rawTab.path !== "string" || !rawTab.path) {
    return null;
  }

  const kind = rawTab.kind === "markdown" ? "markdown" : "text";
  return {
    path: rawTab.path,
    content: typeof rawTab.content === "string" ? rawTab.content : "",
    kind,
    writable: rawTab.writable !== false,
    isDirty: Boolean(rawTab.isDirty),
    markdownViewMode: kind === "markdown" && rawTab.markdownViewMode === "edit" ? "edit" : (kind === "markdown" ? "preview" : "edit"),
  };
}

function snapshotActiveFileAsTransferTab() {
  if (!state.activePath || !state.activeKind) {
    return null;
  }

  return normalizeTransferTab({
    path: state.activePath,
    content: state.content,
    kind: state.activeKind,
    writable: true,
    isDirty: state.isDirty,
    markdownViewMode: state.markdownViewMode,
  });
}

function snapshotAllOpenTabsForTransfer() {
  flushStateToActiveTab();

  if (hasTabSession()) {
    return {
      kind: "tabs",
      tabs: state.openFiles.map(normalizeTransferTab).filter(Boolean),
      singlePath: null,
    };
  }

  const tab = snapshotActiveFileAsTransferTab();
  if (!tab) {
    return {
      kind: "none",
      tabs: [],
      singlePath: null,
    };
  }

  return {
    kind: "single",
    tabs: [tab],
    singlePath: tab.path,
  };
}

function applyTransferredTabsToCurrentWindow(incomingTabs) {
  const normalizedIncoming = incomingTabs.map(normalizeTransferTab).filter(Boolean);
  if (normalizedIncoming.length === 0) {
    return 0;
  }

  flushStateToActiveTab();

  const existingTabs = hasTabSession()
    ? state.openFiles.map(normalizeTransferTab).filter(Boolean)
    : [];

  if (!hasTabSession()) {
    const activeTab = snapshotActiveFileAsTransferTab();
    if (activeTab) {
      existingTabs.push(activeTab);
    }
  }

  const combinedTabs = [...existingTabs, ...normalizedIncoming];

  if (state.mode !== "folder") {
    state.mode = "files";
    state.sidebarVisible = false;
    state.rootPath = null;
    state.entries = [];
    markSidebarTreeDirty();
  }

  state.openFiles = combinedTabs;
  state.activeTabIndex = Math.min(existingTabs.length, state.openFiles.length - 1);
  syncActiveTabToState();
  render();
  updateMenuState();

  return normalizedIncoming.length;
}

async function sendTabTransferResultToSource({ sourceLabel, requestId, acceptedCount }) {
  if (!state.windowLabel || !sourceLabel || !requestId) {
    return;
  }

  await invoke("route_tab_transfer_result", {
    sourceLabel,
    targetLabel: state.windowLabel,
    requestId,
    acceptedCount,
  });
}

async function handleRequestExportAllTabs(payload) {
  const requestId = payload?.requestId;
  const targetLabel = payload?.targetLabel;
  if (!requestId || !targetLabel || !state.windowLabel || targetLabel === state.windowLabel) {
    return;
  }

  const snapshot = snapshotAllOpenTabsForTransfer();
  if (snapshot.tabs.length === 0) {
    await sendTabTransferResultToSource({
      sourceLabel: state.windowLabel,
      requestId,
      acceptedCount: 0,
    }).catch(() => {});
    return;
  }

  pendingOutgoingTabTransfers.set(requestId, {
    kind: snapshot.kind,
    tabCount: snapshot.tabs.length,
    singlePath: snapshot.singlePath,
  });

  try {
    await invoke("route_tab_transfer", {
      sourceLabel: state.windowLabel,
      targetLabel,
      requestId,
      tabs: snapshot.tabs,
    });
  } catch (error) {
    pendingOutgoingTabTransfers.delete(requestId);
    setStatus(String(error), true);
  }
}

async function handleReceiveTransferredTabs(payload) {
  const requestId = payload?.requestId;
  const sourceLabel = payload?.sourceLabel;
  const tabs = Array.isArray(payload?.tabs) ? payload.tabs : [];

  if (!requestId || !sourceLabel) {
    return;
  }

  let acceptedCount = 0;
  try {
    acceptedCount = applyTransferredTabsToCurrentWindow(tabs);
    if (acceptedCount > 0) {
      setStatus(`Added ${acceptedCount} tab${acceptedCount === 1 ? "" : "s"} from another window`);
    }
  } catch (error) {
    setStatus(String(error), true);
    acceptedCount = 0;
  }

  await sendTabTransferResultToSource({
    sourceLabel,
    requestId,
    acceptedCount,
  }).catch((error) => {
    setStatus(String(error), true);
  });
}

function shouldAutoCloseEmptyWindowAfterTransfer() {
  return state.mode !== "folder" && !hasTabSession() && !state.activePath;
}

async function finalizeOutgoingTabTransfer(pending) {
  if (pending.kind === "tabs") {
    state.openFiles = [];
    state.activeTabIndex = 0;
    clearActiveFile();
    if (state.mode !== "folder") {
      state.mode = "empty";
      markSidebarTreeDirty();
    }
  } else if (pending.kind === "single") {
    if (!hasTabSession() && (!pending.singlePath || state.activePath === pending.singlePath)) {
      clearActiveFile();
      if (state.mode !== "folder") {
        state.mode = "empty";
        markSidebarTreeDirty();
      }
    }
  }

  render();
  updateMenuState();

  if (shouldAutoCloseEmptyWindowAfterTransfer()) {
    await invoke("close_current_window").catch((error) => {
      setStatus(String(error), true);
    });
  }
}

async function handleTabTransferResult(payload) {
  const requestId = payload?.requestId;
  if (!requestId) {
    return;
  }

  const pending = pendingOutgoingTabTransfers.get(requestId);
  if (!pending) {
    return;
  }
  pendingOutgoingTabTransfers.delete(requestId);

  const acceptedCount = Number.isFinite(payload?.acceptedCount) ? payload.acceptedCount : 0;
  if (acceptedCount <= 0) {
    return;
  }

  if (acceptedCount !== pending.tabCount) {
    setStatus("Tab merge completed partially; source window was left unchanged", true);
    return;
  }

  await finalizeOutgoingTabTransfer(pending);
  setStatus(`Moved ${acceptedCount} tab${acceptedCount === 1 ? "" : "s"} to another window`);
}

async function openMultipleFiles(paths) {
  await saveNow();

  const loaded = [];
  for (const path of paths) {
    try {
      const payload = await invoke("read_text_file", { path });
      loaded.push({
        path: payload.path,
        content: payload.content,
        kind: payload.kind,
        writable: payload.writable,
        isDirty: false,
        markdownViewMode: payload.kind === "markdown" ? "preview" : "edit",
      });
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
    const tab = loaded[0];
    state.mode = "file";
    state.sidebarVisible = false;
    state.rootPath = null;
    state.entries = [];
    markSidebarTreeDirty();
    state.openFiles = [];
    applyFilePayload(tab, { defaultMarkdownMode: "preview" });
    setStatus(`Opened ${baseName(tab.path)}`);
    render();
    updateMenuState();
    return;
  }

  state.mode = "files";
  state.sidebarVisible = false;
  state.rootPath = null;
  state.entries = [];
  markSidebarTreeDirty();
  state.openFiles = loaded;
  state.activeTabIndex = 0;
  syncActiveTabToState();
  setStatus(`Opened ${loaded.length} files`);
  render();
  updateMenuState();
}

async function openFileAsTab(path) {
  if (!path) {
    return;
  }

  const existing = state.openFiles.findIndex((f) => f.path === path);
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
    const tab = {
      path: payload.path,
      content: payload.content,
      kind: payload.kind,
      writable: payload.writable,
      isDirty: false,
      markdownViewMode: payload.kind === "markdown" ? "preview" : "edit",
    };
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

  await saveNow();

  try {
    const payload = await invoke("read_text_file", { path });
    const currentTab = {
      path: state.activePath,
      content: state.content,
      kind: state.activeKind,
      writable: true,
      isDirty: state.isDirty,
      markdownViewMode: state.markdownViewMode,
    };
    const nextTab = {
      path: payload.path,
      content: payload.content,
      kind: payload.kind,
      writable: payload.writable,
      isDirty: false,
      markdownViewMode: payload.kind === "markdown" ? "preview" : "edit",
    };

    state.mode = "files";
    state.sidebarVisible = false;
    state.rootPath = null;
    state.entries = [];
    markSidebarTreeDirty();
    state.openFiles = [currentTab, nextTab];
    state.activeTabIndex = 1;
    syncActiveTabToState();
    setStatus(`Opened ${baseName(path)}`);
    render();
    updateMenuState();
  } catch (error) {
    setStatus(String(error), true);
  }
}

function switchTab(index) {
  if (index === state.activeTabIndex) {
    return;
  }
  flushStateToActiveTab();
  state.activeTabIndex = index;
  syncActiveTabToState();
  render();
  updateMenuState();
}

async function closeTab(index) {
  const tab = state.openFiles[index];
  if (!tab) {
    return;
  }

  if (index === state.activeTabIndex) {
    await saveNow();
  } else if (tab.isDirty && tab.writable) {
    try {
      await invoke("write_text_file", { path: tab.path, content: tab.content });
    } catch (error) {
      setStatus(String(error), true);
    }
  }

  state.openFiles.splice(index, 1);

  if (state.openFiles.length === 0) {
    state.openFiles = [];
    state.activeTabIndex = 0;
    clearActiveFile();
    if (state.mode !== "folder") {
      state.mode = "empty";
      markSidebarTreeDirty();
    }
    render();
    updateMenuState();
    return;
  }

  if (state.activeTabIndex >= state.openFiles.length) {
    state.activeTabIndex = state.openFiles.length - 1;
  }
  syncActiveTabToState();
  render();
  updateMenuState();
}

async function closeSingleActiveFile() {
  if (!state.activePath) {
    return;
  }

  const closingLabel = baseName(state.activePath);
  await saveNow();

  state.openFiles = [];
  state.activeTabIndex = 0;
  clearActiveFile();
  if (state.mode !== "folder") {
    state.mode = "empty";
    markSidebarTreeDirty();
  }

  setStatus(`Closed ${closingLabel}`);
  render();
  updateMenuState();
}

async function closeActiveFileOrWindow() {
  if (hasTabSession()) {
    await closeTab(state.activeTabIndex);
    return;
  }

  if (state.activePath) {
    await closeSingleActiveFile();
    return;
  }

  await invoke("close_current_window").catch((error) => {
    setStatus(String(error), true);
  });
}

function renderTabBar() {
  const show = state.openFiles.length >= 2;
  el.tabBar.classList.toggle("hidden", !show);

  if (!show) {
    el.tabBar.innerHTML = "";
    return;
  }

  let html = "";
  for (let i = 0; i < state.openFiles.length; i += 1) {
    const tab = state.openFiles[i];
    const isActive = i === state.activeTabIndex;
    const isDirty = isActive ? state.isDirty : tab.isDirty;
    const label = baseName(tab.path);
    html += `<div class="tab${isActive ? " tab-active" : ""}" data-index="${i}">`;
    html += `<button class="tab-close" data-index="${i}" title="Close" aria-label="Close ${escapeAttr(label)}">×</button>`;
    html += `<span class="tab-label" title="${escapeAttr(tab.path)}">${escapeHtml(label)}</span>`;
    if (isDirty) {
      html += `<span class="tab-dirty">●</span>`;
    }
    if (i < 9) {
      html += `<span class="tab-shortcut" aria-hidden="true">⌘${i + 1}</span>`;
    }
    html += `</div>`;
  }
  el.tabBar.innerHTML = html;

  el.tabBar.querySelectorAll(".tab").forEach((tabEl) => {
    tabEl.addEventListener("click", (event) => {
      if (event.target.closest(".tab-close")) {
        return;
      }
      const index = parseInt(tabEl.dataset.index, 10);
      switchTab(index);
    });
  });

  el.tabBar.querySelectorAll(".tab-close").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const index = parseInt(btn.dataset.index, 10);
      await closeTab(index);
    });
  });
}

function toggleMarkdownMode() {
  if (state.activeKind !== "markdown") {
    return;
  }

  state.markdownViewMode = state.markdownViewMode === "preview" ? "edit" : "preview";
  render();
  updateMenuState();
  setStatus(state.markdownViewMode === "preview" ? "Markdown preview" : "Markdown source edit");
}

function toggleSidebarVisibility() {
  if (state.mode !== "folder") {
    return;
  }
  state.sidebarVisible = !state.sidebarVisible;
  render();
  updateMenuState();
}

function scheduleAutosave() {
  if (!isEditable()) {
    return;
  }

  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    saveNow();
  }, 500);
}

async function saveNow() {
  if (!state.activePath || !state.isDirty || !isEditable() || state.isSaving) {
    return;
  }

  state.isSaving = true;
  try {
    await invoke("write_text_file", {
      path: state.activePath,
      content: state.content,
    });
    state.isDirty = false;
    if (hasTabSession() && state.openFiles[state.activeTabIndex]) {
      state.openFiles[state.activeTabIndex].isDirty = false;
      state.openFiles[state.activeTabIndex].content = state.content;
    }
    setStatus("Saved");
  } catch (error) {
    setStatus(String(error), true);
  } finally {
    state.isSaving = false;
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
  }
}

function isEditable() {
  if (!state.activePath) {
    return false;
  }

  if (state.activeKind === "markdown") {
    return state.markdownViewMode === "edit";
  }

  return true;
}

function hasTabSession() {
  return state.openFiles.length > 0;
}

function rememberSidebarSingleClick(path) {
  sidebarClickState.lastPath = path || null;
  sidebarClickState.previousSingleTab = null;
}

function setSidebarSingleClickOpenPromise(promise) {
  sidebarClickState.openPromise = Promise.resolve(promise).catch(() => {});
}

function rememberSidebarPreviousSingleTab(tab) {
  sidebarClickState.previousSingleTab = tab ? normalizeTransferTab(tab) : null;
}

function consumeSidebarDoubleClickPromotion(path) {
  if (
    !path ||
    state.mode !== "folder" ||
    hasTabSession() ||
    state.activePath !== path ||
    sidebarClickState.lastPath !== path
  ) {
    return false;
  }

  const previousTab = normalizeTransferTab(sidebarClickState.previousSingleTab);
  const currentTab = snapshotActiveFileAsTransferTab();
  if (!previousTab || !currentTab || previousTab.path === currentTab.path) {
    return false;
  }

  state.openFiles = [previousTab, currentTab];
  state.activeTabIndex = 1;
  syncActiveTabToState();
  render();
  updateMenuState();
  sidebarClickState.previousSingleTab = null;
  return true;
}

function updateMenuState() {
  invoke("set_menu_state", {
    state: {
      canToggleSidebar: state.mode === "folder",
      canToggleMarkdownMode: state.activeKind === "markdown",
    },
  }).catch((error) => {
    setStatus(String(error), true);
  });
}

function render() {
  syncWindowTitle();
  renderTabBar();

  const showSidebar = state.mode === "folder" && state.sidebarVisible;
  el.workspace.className = showSidebar ? "workspace workspace-folder" : "workspace workspace-empty";
  el.sidebar.classList.toggle("hidden", !showSidebar);
  el.sidebarResizer.classList.toggle("hidden", !showSidebar);
  if (showSidebar) {
    el.workspace.style.setProperty("--sidebar-width", `${state.sidebarWidth}px`);
  } else {
    el.workspace.style.removeProperty("--sidebar-width");
  }

  renderSidebar();
  renderMainPane();
}

function renderSidebar() {
  if (state.mode !== "folder") {
    el.projectRoot.textContent = "";
    el.projectList.innerHTML = "";
    sidebarRenderState.activePath = null;
    sidebarRenderState.treeDirty = true;
    return;
  }

  el.projectRoot.textContent = state.rootPath || "";

  if (sidebarRenderState.treeDirty) {
    const tree = buildEntryTree(state.entries);
    el.projectList.innerHTML = renderTreeHtml(tree, 0);
    bindSidebarItemEvents();
    sidebarRenderState.treeDirty = false;
  }

  syncSidebarActiveItem();
}

function bindSidebarItemEvents() {
  el.projectList.querySelectorAll(".project-item").forEach((button) => {
    button.addEventListener("click", (event) => {
      if (event.detail !== 1) {
        return;
      }

      const path = button.dataset.path;
      if (!path) {
        return;
      }

      rememberSidebarSingleClick(path);

      const openPromise = (async () => {
        const openFilesCount = state.openFiles.length;

        if (shouldSidebarSingleClickIgnoreSamePath({
          mode: state.mode,
          openFilesCount,
          activePath: state.activePath,
          nextPath: path,
        })) {
          return;
        }

        const shouldCapturePreviousSingleTab = shouldCapturePreviousSingleFolderFile({
          mode: state.mode,
          openFilesCount,
          activePath: state.activePath,
          nextPath: path,
        });

        await saveNow();

        if (shouldCapturePreviousSingleTab) {
          rememberSidebarPreviousSingleTab(snapshotActiveFileAsTransferTab());
        }

        if (shouldSidebarSingleClickOpenAsTab({
          mode: state.mode,
          openFilesCount: state.openFiles.length,
        })) {
          await openFileAsTab(path);
          return;
        }

        if (shouldCollapseHiddenSingleTabForSidebarOpen({
          mode: state.mode,
          openFilesCount: state.openFiles.length,
        })) {
          state.openFiles = [];
          state.activeTabIndex = 0;
        }

        await openEntry(path);
      })();

      setSidebarSingleClickOpenPromise(openPromise);
    });

    button.addEventListener("dblclick", async (event) => {
      event.preventDefault();
      const path = button.dataset.path;
      if (!path) {
        return;
      }

      if (sidebarClickState.lastPath === path) {
        await sidebarClickState.openPromise;
        if (consumeSidebarDoubleClickPromotion(path)) {
          return;
        }
      }

      await saveNow();
      await openFolderEntryInTabs(path);
    });
  });

  el.projectList.querySelectorAll(".folder-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const { folderPath } = button.dataset;
      if (!folderPath) {
        return;
      }

      if (state.collapsedFolders.has(folderPath)) {
        state.collapsedFolders.delete(folderPath);
      } else {
        state.collapsedFolders.add(folderPath);
      }

      markSidebarTreeDirty();
      renderSidebar();
    });
  });
}

function syncSidebarActiveItem() {
  const selectedPath = getSidebarSelectedPath({
    mode: state.mode,
    activePath: state.activePath,
    entries: state.entries,
  });

  if (sidebarRenderState.activePath === selectedPath) {
    return;
  }

  if (sidebarRenderState.activePath) {
    const previous = el.projectList.querySelector(`.project-item.active[data-path="${CSS.escape(sidebarRenderState.activePath)}"]`);
    if (previous) {
      previous.classList.remove("active");
    }
  }

  if (selectedPath) {
    const next = el.projectList.querySelector(`.project-item[data-path="${CSS.escape(selectedPath)}"]`);
    if (next) {
      next.classList.add("active");
    }
  }

  sidebarRenderState.activePath = selectedPath;
}

function buildEntryTree(entries) {
  const root = { path: "", name: "", folders: new Map(), files: [] };

  for (const entry of entries) {
    const parts = entry.relPath.split("/").filter(Boolean);
    if (parts.length === 0) {
      continue;
    }

    let node = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const folderName = parts[i];
      const folderPath = node.path ? `${node.path}/${folderName}` : folderName;
      if (!node.folders.has(folderName)) {
        node.folders.set(folderName, {
          path: folderPath,
          name: folderName,
          folders: new Map(),
          files: [],
        });
      }
      node = node.folders.get(folderName);
    }

    node.files.push({
      name: parts[parts.length - 1],
      path: entry.path,
      relPath: entry.relPath,
    });
  }

  return root;
}

function collectFolderPaths(entries) {
  const folders = new Set();

  for (const entry of entries) {
    const parts = entry.relPath.split("/").filter(Boolean);
    if (parts.length <= 1) {
      continue;
    }

    for (let i = 0; i < parts.length - 1; i += 1) {
      const folderPath = parts.slice(0, i + 1).join("/");
      folders.add(folderPath);
    }
  }

  return folders;
}

function renderTreeHtml(node, depth) {
  const folders = [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name));
  node.files.sort((a, b) => a.name.localeCompare(b.name));

  let html = "";

  for (const folder of folders) {
    const isCollapsed = state.collapsedFolders.has(folder.path);
    const expanded = !isCollapsed;
    html += `<button class="folder-toggle" type="button" aria-expanded="${expanded}" style="--indent:${depth};" data-folder-path="${escapeAttr(folder.path)}"><span class="disclosure" aria-hidden="true"></span><span class="folder-icon" aria-hidden="true"></span><span class="folder-label">${escapeHtml(folder.name)}</span></button>`;
    if (!isCollapsed) {
      html += renderTreeHtml(folder, depth + 1);
    }
  }

  for (const file of node.files) {
    html += `<button class="project-item" style="--indent:${depth};" data-path="${escapeAttr(file.path)}" title="${escapeAttr(file.relPath)}">${escapeHtml(file.name)}</button>`;
  }

  return html;
}

function renderMainPane() {
  const hasFile = Boolean(state.activePath);
  el.emptyState.classList.toggle("hidden", hasFile);
  el.editorState.classList.toggle("hidden", !hasFile);

  if (!hasFile) {
    return;
  }

  if (state.activeKind === "markdown" && state.markdownViewMode === "preview") {
    el.editor.classList.add("hidden");
    el.preview.classList.remove("hidden");
    el.preview.innerHTML = renderMarkdown(state.content);
    return;
  }

  el.preview.classList.add("hidden");
  el.editor.classList.remove("hidden");

  if (el.editor.value !== state.content) {
    el.editor.value = state.content;
  }
}

function setStatus(message, isError = false) {
  if (isError) {
    console.error(message);
  }
}

function syncWindowTitle() {
  const nextRepresentedPath =
    state.mode === "folder" ? (state.rootPath || null) : (state.activePath || null);
  const nextTitle = nextRepresentedPath ? baseName(nextRepresentedPath) : "Teex";

  if (
    nextTitle === state.windowTitle &&
    nextRepresentedPath === state.windowRepresentedPath
  ) {
    return;
  }

  state.windowTitle = nextTitle;
  state.windowRepresentedPath = nextRepresentedPath;
  document.title = nextTitle;
  invoke("set_window_title", {
    title: nextTitle,
    representedPath: nextRepresentedPath,
  }).catch((error) => {
    console.error(String(error));
  });
}

function baseName(path) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function renderMarkdown(markdown) {
  const source = markdown.replace(/\r\n/g, "\n");
  const lines = source.split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = line.match(/^```([a-zA-Z0-9_-]*)\s*$/);
    if (fence) {
      const lang = fence[1] || "";
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(`<pre><code class="language-${escapeAttr(lang)}">${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push("<hr />");
      i += 1;
      continue;
    }

    if (line.startsWith("> ")) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quote.push(lines[i].slice(2));
        i += 1;
      }
      blocks.push(`<blockquote>${quote.map((q) => `<p>${renderInline(q)}</p>`).join("")}</blockquote>`);
      continue;
    }

    if (isTableStart(lines, i)) {
      const header = splitTableRow(lines[i]);
      const body = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|")) {
        body.push(splitTableRow(lines[i]));
        i += 1;
      }

      const thead = `<thead><tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${body
        .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
        .join("")}</tbody>`;
      blocks.push(`<table>${thead}${tbody}</table>`);
      continue;
    }

    if (/^\s*([-*+]\s+|\d+\.\s+)/.test(line)) {
      const isOrdered = /^\s*\d+\.\s+/.test(line);
      const tag = isOrdered ? "ol" : "ul";
      const items = [];

      while (i < lines.length && /^\s*([-*+]\s+|\d+\.\s+)/.test(lines[i])) {
        let itemText = lines[i].replace(/^\s*([-*+]\s+|\d+\.\s+)/, "");
        const task = itemText.match(/^\[( |x|X)\]\s+(.*)$/);
        if (task) {
          const checked = task[1].toLowerCase() === "x";
          itemText = `<input type="checkbox" disabled ${checked ? "checked" : ""} /> ${renderInline(task[2])}`;
        } else {
          itemText = renderInline(itemText);
        }
        items.push(`<li>${itemText}</li>`);
        i += 1;
      }

      blocks.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !startsSpecialBlock(lines, i)) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  }

  return blocks.join("\n");
}

function isTableStart(lines, index) {
  if (index + 1 >= lines.length) {
    return false;
  }
  if (!lines[index].includes("|")) {
    return false;
  }
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1]);
}

function splitTableRow(row) {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function startsSpecialBlock(lines, index) {
  const line = lines[index];
  return (
    /^```/.test(line) ||
    /^(#{1,6})\s+/.test(line) ||
    /^\s*([-*_])\1{2,}\s*$/.test(line) ||
    line.startsWith("> ") ||
    /^\s*([-*+]\s+|\d+\.\s+)/.test(line) ||
    isTableStart(lines, index)
  );
}

function renderInline(text) {
  let value = escapeHtml(text);
  value = value.replace(/`([^`]+)`/g, "<code>$1</code>");
  value = value.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  value = value.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  value = value.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
  return value;
}
