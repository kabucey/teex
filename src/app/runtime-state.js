export const EVENTS = {
  openFileSelected: "teex://open-file-selected",
  openFolderSelected: "teex://open-folder-selected",
  osOpenPaths: "teex://os-open-paths",
  projectFolderChanged: "teex://project-folder-changed",
  projectFileChanged: "teex://project-file-changed",
  toggleSidebar: "teex://toggle-sidebar",
  toggleMarkdownMode: "teex://toggle-markdown-mode",
  closeActiveFile: "teex://close-active-file",
  newTab: "teex://new-tab",
  requestExportAllTabs: "teex://request-export-all-tabs",
  receiveTransferredTabs: "teex://receive-transferred-tabs",
  tabTransferResult: "teex://tab-transfer-result",
};

export function createRuntimeState() {
  return {
    state: {
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
      activeEditorScrollTop: 0,
      activePreviewScrollTop: 0,
      activeMarkdownScrollAnchor: null,
      fileScrollMemory: new Map(),
      isDirty: false,
      isSaving: false,
      saveTimer: null,
      windowTitle: "",
      windowRepresentedPath: null,
      windowLabel: "",
    },
    el: {},
    sidebarRenderState: {
      treeDirty: true,
      activePath: null,
    },
    sidebarClickState: {
      lastPath: null,
      previousSingleTab: null,
      openPromise: Promise.resolve(),
    },
    osOpenDeduper: {
      signature: "",
      timestamp: 0,
    },
    pendingOutgoingTabTransfers: new Map(),
    dropOverlayDragState: {
      suppressOverlay: false,
    },
  };
}
