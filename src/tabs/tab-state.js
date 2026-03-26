export function buildTabFromPayload(payload) {
  return {
    path: payload.path,
    content: payload.content,
    savedContent: payload.content,
    kind: payload.kind,
    writable: payload.writable,
    isDirty: false,
    markdownViewMode: payload.kind === "markdown" ? "preview" : "edit",
    scrollState: {
      editorScrollTop: 0,
      previewScrollTop: 0,
    },
  };
}

export function buildUntitledTab() {
  return {
    path: null,
    content: "",
    savedContent: "",
    kind: "markdown",
    writable: true,
    isDirty: false,
    markdownViewMode: "edit",
    scrollState: {
      editorScrollTop: 0,
      previewScrollTop: 0,
    },
  };
}

export function buildDiffTab() {
  return {
    path: null,
    content: "",
    savedContent: "",
    kind: "diff",
    writable: false,
    isDirty: false,
    markdownViewMode: "edit",
    scrollState: {
      editorScrollTop: 0,
      previewScrollTop: 0,
    },
  };
}

export function snapshotActiveStateAsTab(state) {
  if (!state?.activeKind) {
    return null;
  }

  return {
    path: state.activePath,
    content: state.content,
    savedContent: state.savedContent ?? state.content,
    kind: state.activeKind,
    writable: true,
    isDirty: Boolean(state.isDirty),
    markdownViewMode: state.markdownViewMode,
    scrollState: {
      editorScrollTop: Number.isFinite(state.activeEditorScrollTop)
        ? state.activeEditorScrollTop
        : 0,
      previewScrollTop: Number.isFinite(state.activePreviewScrollTop)
        ? state.activePreviewScrollTop
        : 0,
    },
  };
}

export function switchToSingleFileState({
  state,
  payload,
  applyFilePayload,
  markSidebarTreeDirty,
  defaultMarkdownMode = "preview",
}) {
  state.mode = "file";
  state.sidebarVisible = false;
  state.rootPath = null;
  state.entries = [];
  markSidebarTreeDirty();
  state.openFiles = [];
  state.activeTabIndex = 0;
  applyFilePayload(payload, { defaultMarkdownMode });
}

export function switchToMultiTabFileState({
  state,
  tabs,
  activeTabIndex,
  markSidebarTreeDirty,
}) {
  state.mode = "files";
  state.sidebarVisible = false;
  state.rootPath = null;
  state.entries = [];
  markSidebarTreeDirty();
  state.openFiles = tabs;
  state.activeTabIndex = activeTabIndex;
}
