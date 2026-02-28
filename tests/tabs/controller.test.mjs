import test from "node:test";
import assert from "node:assert/strict";

import { buildTabFromPayload, createTabController } from "../../src/tabs/controller.js";

function createControllerHarness({
  stateOverrides = {},
  saveNow = async () => {},
  invoke = async () => {},
  promptCloseDirty = async () => "cancel",
} = {}) {
  const state = {
    mode: "files",
    activePath: null,
    activeKind: "text",
    content: "",
    isDirty: false,
    markdownViewMode: "edit",
    activeEditorScrollTop: 0,
    activePreviewScrollTop: 0,
    openFiles: [],
    activeTabIndex: 0,
    ...stateOverrides,
  };

  const controller = createTabController({
    state,
    invoke,
    baseName: (value) => value.split("/").pop(),
    setStatus: () => {},
    render: () => {},
    updateMenuState: () => {},
    markSidebarTreeDirty: () => {},
    saveNow,
    openFile: async () => {},
    applyFilePayload: () => {},
    clearActiveFile: () => {
      state.activePath = null;
      state.activeKind = null;
      state.content = "";
      state.isDirty = false;
      state.markdownViewMode = "preview";
    },
    hasTabSession: () => state.openFiles.length > 0,
    promptCloseDirty,
    flushStateToActiveTab: () => {
      const tab = state.openFiles[state.activeTabIndex];
      if (!tab) {
        return;
      }
      tab.path = state.activePath;
      tab.kind = state.activeKind;
      tab.content = state.content;
      tab.isDirty = state.isDirty;
      tab.markdownViewMode = state.markdownViewMode;
      tab.scrollState = {
        editorScrollTop: state.activeEditorScrollTop,
        previewScrollTop: state.activePreviewScrollTop,
      };
    },
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

  return { state, controller };
}

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

test("createNewTab in folder mode preserves selected file as first tab", () => {
  const state = {
    mode: "folder",
    activePath: "/project/notes.md",
    activeKind: "markdown",
    content: "# Notes",
    isDirty: true,
    markdownViewMode: "preview",
    activeEditorScrollTop: 12,
    activePreviewScrollTop: 34,
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

  assert.equal(state.mode, "folder");
  assert.equal(state.openFiles.length, 2);
  assert.equal(state.openFiles[0].path, "/project/notes.md");
  assert.equal(state.openFiles[0].content, "# Notes");
  assert.equal(state.openFiles[0].isDirty, true);
  assert.equal(state.openFiles[1].path, null);
  assert.equal(state.activeTabIndex, 1);
  assert.equal(state.activePath, null);
});

test("closeTab keeps dirty tab open when close prompt is canceled", async () => {
  const { state, controller } = createControllerHarness({
    stateOverrides: {
      openFiles: [
        {
          path: "/tmp/a.md",
          kind: "markdown",
          content: "# a",
          writable: true,
          isDirty: true,
          markdownViewMode: "edit",
          scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
        },
      ],
      activeTabIndex: 0,
      activePath: "/tmp/a.md",
      activeKind: "markdown",
      content: "# a",
      isDirty: true,
      markdownViewMode: "edit",
    },
    promptCloseDirty: async () => "cancel",
  });
  await controller.closeTab(0);

  assert.equal(state.openFiles.length, 1);
  assert.equal(state.openFiles[0].path, "/tmp/a.md");
});

test("closeTab saves and closes inactive dirty file when user confirms save", async () => {
  const writeCalls = [];
  const { state, controller } = createControllerHarness({
    stateOverrides: {
      openFiles: [
        {
          path: "/tmp/a.md",
          kind: "markdown",
          content: "# a",
          writable: true,
          isDirty: false,
          markdownViewMode: "preview",
          scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
        },
        {
          path: "/tmp/b.md",
          kind: "markdown",
          content: "# b",
          writable: true,
          isDirty: true,
          markdownViewMode: "edit",
          scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
        },
      ],
      activeTabIndex: 0,
      activePath: "/tmp/a.md",
      activeKind: "markdown",
      content: "# a",
      isDirty: false,
      markdownViewMode: "preview",
    },
    invoke: async (command, payload) => {
      if (command === "write_text_file") {
        writeCalls.push(payload);
      }
    },
    promptCloseDirty: async () => "save",
  });
  await controller.closeTab(1);

  assert.equal(writeCalls.length, 1);
  assert.deepEqual(writeCalls[0], { path: "/tmp/b.md", content: "# b" });
  assert.equal(state.openFiles.length, 1);
  assert.equal(state.openFiles[0].path, "/tmp/a.md");
});

test("closeActiveFileOrWindow closes window when last tab is removed", async () => {
  const invokeCalls = [];
  const { controller } = createControllerHarness({
    stateOverrides: {
      mode: "files",
      openFiles: [
        {
          path: null,
          kind: "markdown",
          content: "",
          writable: true,
          isDirty: false,
          markdownViewMode: "edit",
          scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
        },
      ],
      activeTabIndex: 0,
      activePath: null,
    },
    invoke: async (cmd) => {
      invokeCalls.push(cmd);
    },
    promptCloseDirty: async () => "discard",
  });
  await controller.closeActiveFileOrWindow();

  assert.ok(invokeCalls.includes("close_current_window"));
});

test("closeActiveFileOrWindow does not close window when tabs remain", async () => {
  const invokeCalls = [];
  const { controller } = createControllerHarness({
    stateOverrides: {
      mode: "files",
      openFiles: [
        {
          path: "/tmp/a.md",
          kind: "markdown",
          content: "# a",
          writable: true,
          isDirty: false,
          markdownViewMode: "preview",
          scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
        },
        {
          path: "/tmp/b.md",
          kind: "markdown",
          content: "# b",
          writable: true,
          isDirty: false,
          markdownViewMode: "preview",
          scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
        },
      ],
      activeTabIndex: 0,
      activePath: "/tmp/a.md",
    },
    invoke: async (cmd) => {
      invokeCalls.push(cmd);
    },
  });
  await controller.closeActiveFileOrWindow();

  assert.ok(!invokeCalls.includes("close_current_window"));
});

test("closeActiveFileOrWindow does not close window when last tab removed in folder mode", async () => {
  const invokeCalls = [];
  const { controller } = createControllerHarness({
    stateOverrides: {
      mode: "folder",
      openFiles: [
        {
          path: "/project/notes.md",
          kind: "markdown",
          content: "# notes",
          writable: true,
          isDirty: false,
          markdownViewMode: "preview",
          scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
        },
      ],
      activeTabIndex: 0,
      activePath: "/project/notes.md",
    },
    invoke: async (cmd) => {
      invokeCalls.push(cmd);
    },
  });
  await controller.closeActiveFileOrWindow();

  assert.ok(!invokeCalls.includes("close_current_window"));
});

test("closeTab restores previous active tab when save is canceled for inactive untitled tab", async () => {
  const { state, controller } = createControllerHarness({
    stateOverrides: {
      openFiles: [
        {
          path: "/tmp/a.md",
          kind: "markdown",
          content: "# a",
          writable: true,
          isDirty: false,
          markdownViewMode: "preview",
          scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
        },
        {
          path: null,
          kind: "markdown",
          content: "# draft",
          writable: true,
          isDirty: true,
          markdownViewMode: "edit",
          scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
        },
      ],
      activeTabIndex: 0,
      activePath: "/tmp/a.md",
      activeKind: "markdown",
      content: "# a",
      isDirty: false,
      markdownViewMode: "preview",
    },
    saveNow: async () => {},
    promptCloseDirty: async () => "save",
  });
  await controller.closeTab(1);

  assert.equal(state.openFiles.length, 2);
  assert.equal(state.activeTabIndex, 0);
  assert.equal(state.activePath, "/tmp/a.md");
});
