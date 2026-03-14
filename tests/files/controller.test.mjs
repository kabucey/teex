import assert from "node:assert/strict";
import test from "node:test";

import {
  createFileController,
  didProjectEntriesChange,
} from "../../src/files/controller.js";

function createFileControllerHarness({
  stateOverrides = {},
  invoke = async () => {},
  saveNow = async () => {},
  openFileAsTab = async () => {},
  openFileInTabs = async () => {},
} = {}) {
  const state = {
    mode: "empty",
    sidebarVisible: true,
    rootPath: "/project",
    entries: [],
    collapsedFolders: new Set(),
    openFiles: [],
    activeTabIndex: 0,
    activePath: null,
    activeKind: null,
    content: "",
    isDirty: false,
    markdownViewMode: "preview",
    activeEditorScrollTop: 0,
    activePreviewScrollTop: 0,
    ...stateOverrides,
  };

  const statusCalls = [];
  let renderCalls = 0;
  let updateMenuCalls = 0;
  let markTreeDirtyCalls = 0;
  const applyFilePayloadCalls = [];

  const controller = createFileController({
    state,
    invoke,
    baseName: (value) => value.split("/").pop(),
    saveNow,
    setStatus: (message, isError = false) => {
      statusCalls.push({ message, isError });
    },
    render: () => {
      renderCalls += 1;
    },
    updateMenuState: () => {
      updateMenuCalls += 1;
    },
    markSidebarTreeDirty: () => {
      markTreeDirtyCalls += 1;
    },
    applyFilePayload: (payload, options) => {
      applyFilePayloadCalls.push({ payload, options });
      state.activePath = payload.path;
      state.activeKind = payload.kind;
      state.content = payload.content;
      state.isDirty = false;
      state.markdownViewMode =
        payload.kind === "markdown" ? options.defaultMarkdownMode : "edit";
    },
    clearActiveFile: () => {
      state.activePath = null;
      state.activeKind = null;
      state.content = "";
      state.isDirty = false;
      state.markdownViewMode = "preview";
    },
    hasTabSession: () => state.openFiles.length > 0,
    openFileAsTab,
    openFileInTabs,
  });

  return {
    state,
    controller,
    statusCalls,
    applyFilePayloadCalls,
    get renderCalls() {
      return renderCalls;
    },
    get updateMenuCalls() {
      return updateMenuCalls;
    },
    get markTreeDirtyCalls() {
      return markTreeDirtyCalls;
    },
  };
}

test("didProjectEntriesChange detects path and relPath changes", () => {
  const a = [
    { path: "/p/a.md", relPath: "a.md" },
    { path: "/p/b.md", relPath: "b.md" },
  ];

  assert.equal(didProjectEntriesChange(a, [...a]), false);
  assert.equal(
    didProjectEntriesChange(a, [{ path: "/p/a.md", relPath: "a.md" }]),
    true,
  );
  assert.equal(
    didProjectEntriesChange(a, [
      { path: "/p/a.md", relPath: "a.md" },
      { path: "/p/c.md", relPath: "c.md" },
    ]),
    true,
  );
  assert.equal(
    didProjectEntriesChange(a, [
      { path: "/p/a.md", relPath: "a.md" },
      { path: "/p/b.md", relPath: "renamed/b.md" },
    ]),
    true,
  );
});

test("openFile switches to single-file mode and clears folder context", async () => {
  const invokeCalls = [];
  const payload = {
    path: "/tmp/a.md",
    kind: "markdown",
    content: "# A",
    writable: true,
  };
  const harness = createFileControllerHarness({
    stateOverrides: {
      mode: "folder",
      sidebarVisible: true,
      rootPath: "/project",
      entries: [{ path: "/project/old.md", relPath: "old.md" }],
      openFiles: [{ path: "/project/old.md" }],
      activeTabIndex: 2,
    },
    invoke: async (command, args) => {
      invokeCalls.push({ command, args });
      if (command === "read_text_file") {
        return payload;
      }
    },
  });

  await harness.controller.openFile("/tmp/a.md");

  assert.equal(harness.state.mode, "file");
  assert.equal(harness.state.sidebarVisible, false);
  assert.equal(harness.state.rootPath, null);
  assert.deepEqual(harness.state.entries, []);
  assert.deepEqual(harness.state.openFiles, []);
  assert.equal(harness.state.activeTabIndex, 0);
  assert.equal(harness.state.activePath, "/tmp/a.md");
  assert.equal(harness.state.markdownViewMode, "preview");
  assert.equal(harness.markTreeDirtyCalls, 1);
  assert.equal(harness.renderCalls, 1);
  assert.equal(harness.updateMenuCalls, 1);
  assert.deepEqual(harness.applyFilePayloadCalls, [
    {
      payload,
      options: { defaultMarkdownMode: "preview" },
    },
  ]);
  assert.deepEqual(invokeCalls, [
    { command: "clear_project_folder_watch", args: undefined },
    { command: "read_text_file", args: { path: "/tmp/a.md" } },
  ]);
  assert.deepEqual(harness.statusCalls, [
    { message: "Opened a.md", isError: false },
  ]);
});

test("openFolderEntryInTabs snapshots active file before opening another tab", async () => {
  const openTabCalls = [];
  const harness = createFileControllerHarness({
    stateOverrides: {
      mode: "folder",
      activePath: "/project/current.md",
      activeKind: "markdown",
      content: "# Current",
      isDirty: true,
      markdownViewMode: "preview",
      activeEditorScrollTop: 12,
      activePreviewScrollTop: 34,
    },
    openFileAsTab: async (path) => {
      openTabCalls.push(path);
    },
  });

  await harness.controller.openFolderEntryInTabs("/project/next.md");

  assert.equal(harness.state.openFiles.length, 1);
  assert.deepEqual(harness.state.openFiles[0], {
    path: "/project/current.md",
    content: "# Current",
    savedContent: "# Current",
    kind: "markdown",
    writable: true,
    isDirty: true,
    markdownViewMode: "preview",
    scrollState: {
      editorScrollTop: 12,
      previewScrollTop: 34,
    },
  });
  assert.equal(harness.state.activeTabIndex, 0);
  assert.deepEqual(openTabCalls, ["/project/next.md"]);
});

test("openFolderEntryInTabs falls back to openEntry when active state cannot be snapshotted", async () => {
  const invokeCalls = [];
  const payload = {
    path: "/project/next.md",
    kind: "markdown",
    content: "# Next",
    writable: true,
  };
  const harness = createFileControllerHarness({
    stateOverrides: {
      mode: "folder",
      activePath: "/project/current.md",
      activeKind: null,
      content: "# Current",
    },
    invoke: async (command, args) => {
      invokeCalls.push({ command, args });
      if (command === "read_text_file") {
        return payload;
      }
    },
    openFileAsTab: async () => {
      throw new Error("should not open as tab");
    },
  });

  await harness.controller.openFolderEntryInTabs("/project/next.md");

  assert.deepEqual(harness.state.openFiles, []);
  assert.equal(harness.state.activePath, "/project/next.md");
  assert.deepEqual(harness.applyFilePayloadCalls, [
    {
      payload,
      options: { defaultMarkdownMode: "preview" },
    },
  ]);
  assert.deepEqual(invokeCalls, [
    { command: "read_text_file", args: { path: "/project/next.md" } },
  ]);
  assert.deepEqual(harness.statusCalls, [
    { message: "Opened next.md", isError: false },
  ]);
});

test("openFolder does not auto-open any file when folder has entries", async () => {
  const invokeCalls = [];
  const harness = createFileControllerHarness({
    invoke: async (command, args) => {
      invokeCalls.push({ command, args });
      if (command === "list_project_entries") {
        return [
          { path: "/project/a.md", relPath: "a.md" },
          { path: "/project/b.md", relPath: "b.md" },
        ];
      }
    },
  });

  await harness.controller.openFolder("/project");

  assert.equal(harness.state.mode, "folder");
  assert.equal(harness.state.rootPath, "/project");
  assert.equal(harness.state.entries.length, 2);
  assert.equal(harness.state.activePath, null);
  assert.equal(harness.state.activeKind, null);
  assert.equal(harness.state.content, "");
  assert.deepEqual(
    invokeCalls.filter((c) => c.command === "read_text_file"),
    [],
  );
});
