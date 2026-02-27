export function hasTabSession(state) {
  return state.openFiles.length > 0;
}

export function applyFilePayloadToState(state, payload, options) {
  const defaultMarkdownMode = options?.defaultMarkdownMode === "edit" ? "edit" : "preview";
  const preserveMarkdownMode = options?.preserveMarkdownMode === true;
  const previousPath = state.activePath;
  const previousKind = state.activeKind;
  const previousMarkdownMode = state.markdownViewMode;

  state.activePath = payload.path;
  state.activeKind = payload.kind;
  state.content = payload.content;
  state.isDirty = false;
  state.activeEditorScrollTop = 0;
  state.activePreviewScrollTop = 0;
  state.activeMarkdownScrollAnchor = null;
  clearTimeout(state.saveTimer);
  state.saveTimer = null;

  if (state.activeKind === "markdown") {
    const shouldPreserveMarkdownMode =
      preserveMarkdownMode
      && previousKind === "markdown"
      && previousPath === payload.path;
    state.markdownViewMode = shouldPreserveMarkdownMode ? previousMarkdownMode : defaultMarkdownMode;
  } else {
    state.markdownViewMode = "edit";
  }
}

export function clearActiveFileInState(state) {
  state.activePath = null;
  state.activeKind = null;
  state.content = "";
  state.isDirty = false;
  state.markdownViewMode = "preview";
  state.activeEditorScrollTop = 0;
  state.activePreviewScrollTop = 0;
  state.activeMarkdownScrollAnchor = null;
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
}

export function flushStateToActiveTabInState(state) {
  if (!hasTabSession(state)) {
    return;
  }
  const tab = state.openFiles[state.activeTabIndex];
  if (!tab) {
    return;
  }
  tab.content = state.content;
  tab.isDirty = state.isDirty;
  tab.markdownViewMode = state.markdownViewMode;
  tab.scrollState = {
    editorScrollTop: Number.isFinite(state.activeEditorScrollTop) ? state.activeEditorScrollTop : 0,
    previewScrollTop: Number.isFinite(state.activePreviewScrollTop) ? state.activePreviewScrollTop : 0,
  };
}

export function syncActiveTabToStateFromTabs(state) {
  if (!hasTabSession(state)) {
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
  state.activeEditorScrollTop = Number.isFinite(tab.scrollState?.editorScrollTop)
    ? tab.scrollState.editorScrollTop
    : 0;
  state.activePreviewScrollTop = Number.isFinite(tab.scrollState?.previewScrollTop)
    ? tab.scrollState.previewScrollTop
    : 0;
  state.activeMarkdownScrollAnchor = null;
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
}

export function normalizeTransferTab(rawTab) {
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
    markdownViewMode:
      kind === "markdown" && rawTab.markdownViewMode === "edit"
        ? "edit"
        : (kind === "markdown" ? "preview" : "edit"),
    scrollState: {
      editorScrollTop: Number.isFinite(rawTab.scrollState?.editorScrollTop)
        ? rawTab.scrollState.editorScrollTop
        : 0,
      previewScrollTop: Number.isFinite(rawTab.scrollState?.previewScrollTop)
        ? rawTab.scrollState.previewScrollTop
        : 0,
    },
  };
}

export function snapshotActiveFileAsTransferTab(state) {
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
    scrollState: {
      editorScrollTop: Number.isFinite(state.activeEditorScrollTop) ? state.activeEditorScrollTop : 0,
      previewScrollTop: Number.isFinite(state.activePreviewScrollTop) ? state.activePreviewScrollTop : 0,
    },
  });
}

export function snapshotAllOpenTabsForTransfer(state) {
  flushStateToActiveTabInState(state);

  if (hasTabSession(state)) {
    return {
      kind: "tabs",
      tabs: state.openFiles.map(normalizeTransferTab).filter(Boolean),
      singlePath: null,
    };
  }

  const tab = snapshotActiveFileAsTransferTab(state);
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
