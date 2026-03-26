import assert from "node:assert/strict";
import test from "node:test";

import {
  applyFilePayloadToState,
  clearActiveFileInState,
  flushStateToActiveTabInState,
  hasTabSession,
  normalizeTransferTab,
  reconcileRestoredFolderTabs,
  snapshotActiveFileAsTransferTab,
  snapshotAllOpenTabsForTransfer,
  syncActiveTabToStateFromTabs,
} from "../../src/tabs/session.js";

function makeState(overrides = {}) {
  return {
    openFiles: [],
    activeTabIndex: 0,
    activePath: null,
    activeKind: null,
    content: "",
    isDirty: false,
    markdownViewMode: "preview",
    activeEditorScrollTop: 0,
    activePreviewScrollTop: 0,
    activeMarkdownScrollAnchor: null,
    saveTimer: null,
    ...overrides,
  };
}

test("normalizeTransferTab sanitizes invalid and partial tab records", () => {
  assert.equal(normalizeTransferTab(null), null);

  // Empty string path is preserved (not rejected)
  assert.deepEqual(normalizeTransferTab({ path: "" }), {
    path: "",
    kind: "text",
    content: "",
    savedContent: "",
    writable: true,
    isDirty: false,
    markdownViewMode: "edit",
    scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
  });

  // Null path (untitled tab) is preserved
  assert.deepEqual(
    normalizeTransferTab({ path: null, kind: "text", content: "draft" }),
    {
      path: null,
      kind: "text",
      content: "draft",
      savedContent: "draft",
      writable: true,
      isDirty: false,
      markdownViewMode: "edit",
      scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
    },
  );

  // Undefined path becomes null
  assert.deepEqual(normalizeTransferTab({ kind: "text" }), {
    path: null,
    kind: "text",
    content: "",
    savedContent: "",
    writable: true,
    isDirty: false,
    markdownViewMode: "edit",
    scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
  });

  assert.deepEqual(
    normalizeTransferTab({
      path: "/a.md",
      kind: "markdown",
      content: 123,
      writable: false,
      isDirty: 1,
      markdownViewMode: "edit",
    }),
    {
      path: "/a.md",
      kind: "markdown",
      content: "",
      savedContent: "",
      writable: false,
      isDirty: true,
      markdownViewMode: "edit",
      scrollState: {
        editorScrollTop: 0,
        previewScrollTop: 0,
      },
    },
  );

  assert.deepEqual(normalizeTransferTab({ path: "/a.bin", kind: "other" }), {
    path: "/a.bin",
    kind: "text",
    content: "",
    savedContent: "",
    writable: true,
    isDirty: false,
    markdownViewMode: "edit",
    scrollState: {
      editorScrollTop: 0,
      previewScrollTop: 0,
    },
  });

  // "code" kind must be preserved (not collapsed to "text")
  assert.deepEqual(
    normalizeTransferTab({
      path: "/a.js",
      kind: "code",
      content: "const x = 1;",
    }),
    {
      path: "/a.js",
      kind: "code",
      content: "const x = 1;",
      savedContent: "const x = 1;",
      writable: true,
      isDirty: false,
      markdownViewMode: "edit",
      scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
    },
  );
});

test("apply/clear file payload updates active state and markdown mode", () => {
  const state = makeState({
    activePath: "/prev.md",
    activeKind: "markdown",
    markdownViewMode: "edit",
    saveTimer: setTimeout(() => {}, 1000),
  });

  applyFilePayloadToState(
    state,
    {
      path: "/a.md",
      kind: "markdown",
      content: "# x",
    },
    { defaultMarkdownMode: "preview" },
  );
  assert.equal(state.activePath, "/a.md");
  assert.equal(state.markdownViewMode, "preview");
  assert.equal(state.isDirty, false);
  assert.equal(state.activeEditorScrollTop, 0);
  assert.equal(state.activePreviewScrollTop, 0);
  assert.equal(state.saveTimer, null);

  state.markdownViewMode = "edit";
  applyFilePayloadToState(
    state,
    {
      path: "/a.md",
      kind: "markdown",
      content: "# y",
    },
    {
      defaultMarkdownMode: "preview",
      preserveMarkdownMode: true,
    },
  );
  assert.equal(state.markdownViewMode, "edit");

  applyFilePayloadToState(
    state,
    {
      path: "/a.txt",
      kind: "text",
      content: "x",
    },
    { defaultMarkdownMode: "preview" },
  );
  assert.equal(state.markdownViewMode, "edit");

  state.saveTimer = setTimeout(() => {}, 1000);
  clearActiveFileInState(state);
  assert.equal(state.activePath, null);
  assert.equal(state.activeKind, null);
  assert.equal(state.content, "");
  assert.equal(state.markdownViewMode, "preview");
  assert.equal(state.activeEditorScrollTop, 0);
  assert.equal(state.activePreviewScrollTop, 0);
  assert.equal(state.saveTimer, null);
});

test("flush/sync active tab mirror state and tabs", () => {
  const state = makeState({
    openFiles: [
      {
        path: "/a.md",
        kind: "markdown",
        content: "old",
        isDirty: false,
        markdownViewMode: "preview",
        scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
      },
    ],
    activePath: "/a.md",
    activeKind: "markdown",
    content: "new",
    isDirty: true,
    markdownViewMode: "edit",
    activeEditorScrollTop: 120,
    activePreviewScrollTop: 340,
  });

  flushStateToActiveTabInState(state);
  assert.equal(state.openFiles[0].content, "new");
  assert.equal(state.openFiles[0].isDirty, true);
  assert.equal(state.openFiles[0].markdownViewMode, "edit");
  assert.equal(state.openFiles[0].scrollState.editorScrollTop, 120);
  assert.equal(state.openFiles[0].scrollState.previewScrollTop, 340);

  state.content = "";
  state.isDirty = false;
  state.markdownViewMode = "preview";
  state.saveTimer = setTimeout(() => {}, 1000);
  syncActiveTabToStateFromTabs(state);
  assert.equal(state.content, "new");
  assert.equal(state.isDirty, true);
  assert.equal(state.markdownViewMode, "edit");
  assert.equal(state.activeEditorScrollTop, 120);
  assert.equal(state.activePreviewScrollTop, 340);
  assert.equal(state.saveTimer, null);
});

test("snapshot helpers return none/single/tabs payloads", () => {
  const empty = makeState();
  assert.equal(hasTabSession(empty), false);
  assert.deepEqual(snapshotAllOpenTabsForTransfer(empty), {
    kind: "none",
    tabs: [],
    singlePath: null,
  });

  const single = makeState({
    activePath: "/one.md",
    activeKind: "markdown",
    content: "# One",
    isDirty: true,
    markdownViewMode: "edit",
    activeEditorScrollTop: 222,
    activePreviewScrollTop: 444,
  });
  assert.equal(hasTabSession(single), false);
  assert.deepEqual(snapshotActiveFileAsTransferTab(single), {
    path: "/one.md",
    content: "# One",
    savedContent: "# One",
    kind: "markdown",
    writable: true,
    isDirty: true,
    markdownViewMode: "edit",
    scrollState: {
      editorScrollTop: 222,
      previewScrollTop: 444,
    },
  });
  assert.deepEqual(snapshotAllOpenTabsForTransfer(single), {
    kind: "single",
    tabs: [snapshotActiveFileAsTransferTab(single)],
    singlePath: "/one.md",
  });

  // Untitled active file (no path) can be snapshotted
  const untitled = makeState({
    activePath: null,
    activeKind: "text",
    content: "draft content",
    isDirty: true,
  });
  assert.deepEqual(snapshotActiveFileAsTransferTab(untitled), {
    path: null,
    content: "draft content",
    savedContent: "draft content",
    kind: "text",
    writable: true,
    isDirty: true,
    markdownViewMode: "edit",
    scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
  });

  const tabs = makeState({
    openFiles: [
      {
        path: "/a.md",
        kind: "markdown",
        content: "A",
        isDirty: false,
        markdownViewMode: "preview",
      },
      {
        path: "/b.txt",
        kind: "text",
        content: "B",
        isDirty: false,
        markdownViewMode: "edit",
        scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
      },
    ],
    activeTabIndex: 1,
    activePath: "/b.txt",
    activeKind: "text",
    content: "B2",
    isDirty: true,
    markdownViewMode: "edit",
  });
  const snapshot = snapshotAllOpenTabsForTransfer(tabs);
  assert.equal(snapshot.kind, "tabs");
  assert.equal(snapshot.tabs.length, 2);
  assert.equal(snapshot.tabs[1].content, "B2");
  assert.deepEqual(snapshot.tabs[1].scrollState, {
    editorScrollTop: 0,
    previewScrollTop: 0,
  });
  assert.equal(snapshot.singlePath, null);
});

test("reconcileRestoredFolderTabs removes auto-opened tab not in saved tabs", () => {
  const state = makeState({
    openFiles: [
      { path: "/auto.md", kind: "markdown", content: "" },
      { path: "/saved-a.md", kind: "markdown", content: "" },
      { path: "/saved-b.md", kind: "markdown", content: "" },
    ],
    activeTabIndex: 0,
  });

  const sessionTabs = [{ path: "/saved-a.md" }, { path: "/saved-b.md" }];

  const { switchToIndex } = reconcileRestoredFolderTabs(state, sessionTabs, 1);

  assert.equal(state.openFiles.length, 2);
  assert.equal(state.openFiles[0].path, "/saved-a.md");
  assert.equal(state.openFiles[1].path, "/saved-b.md");
  assert.equal(switchToIndex, 1);
});

test("reconcileRestoredFolderTabs keeps auto-opened tab when in saved tabs", () => {
  const state = makeState({
    openFiles: [
      { path: "/saved-a.md", kind: "markdown", content: "" },
      { path: "/saved-b.md", kind: "markdown", content: "" },
    ],
    activeTabIndex: 0,
  });

  const sessionTabs = [{ path: "/saved-a.md" }, { path: "/saved-b.md" }];

  const { switchToIndex } = reconcileRestoredFolderTabs(state, sessionTabs, 0);

  assert.equal(state.openFiles.length, 2);
  assert.equal(state.openFiles[0].path, "/saved-a.md");
  assert.equal(switchToIndex, 0);
});

test("reconcileRestoredFolderTabs returns -1 for empty session tabs", () => {
  const state = makeState({
    openFiles: [{ path: "/auto.md", kind: "markdown", content: "" }],
    activeTabIndex: 0,
  });

  const { switchToIndex } = reconcileRestoredFolderTabs(state, [], 0);
  assert.equal(switchToIndex, -1);
  // No tabs removed when session tabs is empty
  assert.equal(state.openFiles.length, 1);
});

test("reconcileRestoredFolderTabs clamps out-of-range activeTabIndex", () => {
  const state = makeState({
    openFiles: [{ path: "/a.md", kind: "markdown", content: "" }],
    activeTabIndex: 0,
  });

  const { switchToIndex } = reconcileRestoredFolderTabs(
    state,
    [{ path: "/a.md" }],
    5,
  );
  assert.equal(switchToIndex, -1);
});

test("reconcileRestoredFolderTabs adjusts activeTabIndex when splicing", () => {
  const state = makeState({
    openFiles: [
      { path: "/auto.md", kind: "markdown", content: "" },
      { path: "/saved.md", kind: "markdown", content: "" },
    ],
    activeTabIndex: 1,
  });

  reconcileRestoredFolderTabs(state, [{ path: "/saved.md" }], 0);

  assert.equal(state.openFiles.length, 1);
  assert.equal(state.openFiles[0].path, "/saved.md");
  assert.equal(state.activeTabIndex, 0);
});
