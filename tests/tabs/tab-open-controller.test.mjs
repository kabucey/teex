import assert from "node:assert/strict";
import test from "node:test";

import { createTabOpenController } from "../../src/tabs/tab-open-controller.js";

function createHarness({
  stateOverrides = {},
  invoke = async () => {},
  openFile = async () => {},
} = {}) {
  const state = {
    mode: "files",
    activePath: "/tmp/a.md",
    activeKind: "markdown",
    content: "# A",
    isDirty: false,
    markdownViewMode: "preview",
    openFiles: [
      {
        path: "/tmp/a.md",
        content: "# A",
        kind: "markdown",
        writable: true,
        isDirty: false,
        markdownViewMode: "preview",
        scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
      },
    ],
    activeTabIndex: 0,
    ...stateOverrides,
  };

  const statuses = [];
  let renderCalls = 0;
  let menuCalls = 0;

  const controller = createTabOpenController({
    state,
    invoke,
    baseName: (value) => value.split("/").pop(),
    setStatus: (message, isError = false) => {
      statuses.push({ message, isError });
    },
    render: () => {
      renderCalls += 1;
    },
    updateMenuState: () => {
      menuCalls += 1;
    },
    markSidebarTreeDirty: () => {},
    saveNow: async () => {},
    openFile,
    applyFilePayload: () => {},
    flushStateToActiveTab: () => {
      const tab = state.openFiles[state.activeTabIndex];
      if (tab) {
        tab.content = state.content;
      }
    },
    syncActiveTabToState: () => {
      const tab = state.openFiles[state.activeTabIndex];
      state.activePath = tab?.path ?? null;
      state.content = tab?.content ?? "";
    },
    recordNavOnActiveTab: () => {},
  });

  return {
    controller,
    state,
    statuses,
    get menuCalls() {
      return menuCalls;
    },
    get renderCalls() {
      return renderCalls;
    },
  };
}

test("openFileAsTab appends new tab and activates it", async () => {
  const harness = createHarness({
    invoke: async (command, args) => {
      if (command === "read_text_file") {
        return {
          path: args.path,
          content: "loaded",
          kind: "text",
          writable: true,
        };
      }
      return undefined;
    },
  });

  await harness.controller.openFileAsTab("/tmp/b.txt");

  assert.equal(harness.state.openFiles.length, 2);
  assert.equal(harness.state.activeTabIndex, 1);
  assert.equal(harness.state.activePath, "/tmp/b.txt");
  assert.equal(harness.renderCalls, 1);
  assert.equal(harness.menuCalls, 1);
  assert.deepEqual(harness.statuses, [
    { message: "Opened b.txt", isError: false },
  ]);
});

test("openFileInTabs delegates to openFile when single untitled tab is empty", async () => {
  let delegatedPath = null;
  const harness = createHarness({
    stateOverrides: {
      mode: "files",
      openFiles: [
        {
          path: null,
          content: "",
          kind: "markdown",
          writable: true,
          isDirty: false,
          markdownViewMode: "edit",
          scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
        },
      ],
      activePath: null,
      content: "",
    },
    openFile: async (path) => {
      delegatedPath = path;
    },
  });

  await harness.controller.openFileInTabs("/tmp/new.md");
  assert.equal(delegatedPath, "/tmp/new.md");
});
