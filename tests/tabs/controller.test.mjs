import test from "node:test";
import assert from "node:assert/strict";

import { buildTabFromPayload, createTabController } from "../../src/tabs/controller.js";

test("buildTabFromPayload initializes clean tab state and markdown mode", () => {
  assert.deepEqual(
    buildTabFromPayload({
      path: "/a.md",
      content: "# a",
      kind: "markdown",
      writable: true,
    }),
    {
      path: "/a.md",
      content: "# a",
      kind: "markdown",
      writable: true,
      isDirty: false,
      markdownViewMode: "preview",
      scrollState: {
        editorScrollTop: 0,
        previewScrollTop: 0,
      },
    },
  );

  assert.deepEqual(
    buildTabFromPayload({
      path: "/a.txt",
      content: "a",
      kind: "text",
      writable: false,
    }),
    {
      path: "/a.txt",
      content: "a",
      kind: "text",
      writable: false,
      isDirty: false,
      markdownViewMode: "edit",
      scrollState: {
        editorScrollTop: 0,
        previewScrollTop: 0,
      },
    },
  );
});

test("createNewTab defaults untitled tabs to markdown edit mode", () => {
  const state = {
    mode: "empty",
    activePath: null,
    activeKind: "text",
    content: "",
    isDirty: false,
    markdownViewMode: "edit",
    activeEditorScrollTop: 0,
    activePreviewScrollTop: 0,
    openFiles: [],
    activeTabIndex: 0,
  };

  const controller = createTabController({
    state,
    invoke: async () => {},
    baseName: (value) => value,
    setStatus: () => {},
    render: () => {},
    updateMenuState: () => {},
    markSidebarTreeDirty: () => {},
    saveNow: async () => {},
    openFile: async () => {},
    applyFilePayload: () => {},
    clearActiveFile: () => {},
    hasTabSession: () => state.openFiles.length > 0,
    flushStateToActiveTab: () => {},
    syncActiveTabToState: () => {
      const active = state.openFiles[state.activeTabIndex];
      state.activePath = active?.path ?? null;
      state.activeKind = active?.kind ?? "text";
      state.content = active?.content ?? "";
      state.isDirty = Boolean(active?.isDirty);
      state.markdownViewMode = active?.markdownViewMode ?? "edit";
      state.activeEditorScrollTop = active?.scrollState?.editorScrollTop ?? 0;
      state.activePreviewScrollTop = active?.scrollState?.previewScrollTop ?? 0;
    },
  });

  controller.createNewTab();

  assert.equal(state.mode, "files");
  assert.equal(state.openFiles.length, 1);
  assert.equal(state.openFiles[0].path, null);
  assert.equal(state.openFiles[0].kind, "markdown");
  assert.equal(state.openFiles[0].markdownViewMode, "edit");
  assert.equal(state.activeKind, "markdown");
  assert.equal(state.markdownViewMode, "edit");
});
