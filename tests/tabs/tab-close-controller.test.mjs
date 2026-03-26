import assert from "node:assert/strict";
import test from "node:test";

import { createTabCloseController } from "../../src/tabs/tab-close-controller.js";

function createHarness({
  stateOverrides = {},
  promptCloseDirty = async () => "cancel",
  saveNow = async () => {},
  invoke = async () => {},
} = {}) {
  const state = {
    mode: "files",
    activePath: "/tmp/a.md",
    isDirty: true,
    openFiles: [
      {
        path: "/tmp/a.md",
        content: "# A",
        kind: "markdown",
        writable: true,
        isDirty: true,
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
  let treeDirtyCalls = 0;

  const controller = createTabCloseController({
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
    markSidebarTreeDirty: () => {
      treeDirtyCalls += 1;
    },
    saveNow,
    clearActiveFile: () => {
      state.activePath = null;
      state.isDirty = false;
    },
    hasTabSession: () => state.openFiles.length > 0,
    flushStateToActiveTab: () => {},
    syncActiveTabToState: () => {},
    promptCloseDirty,
  });

  return {
    controller,
    state,
    statuses,
    get renderCalls() {
      return renderCalls;
    },
    get menuCalls() {
      return menuCalls;
    },
    get treeDirtyCalls() {
      return treeDirtyCalls;
    },
  };
}

function makeTab(path, { isDirty = false } = {}) {
  return {
    path,
    content: "",
    kind: "markdown",
    writable: true,
    isDirty,
    markdownViewMode: "preview",
    scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
  };
}

test("closeOtherTabs closes all tabs except the target", async () => {
  const harness = createHarness({
    stateOverrides: {
      mode: "files",
      isDirty: false,
      openFiles: [
        makeTab("/tmp/a.md"),
        makeTab("/tmp/b.md"),
        makeTab("/tmp/c.md"),
      ],
      activeTabIndex: 0,
    },
    promptCloseDirty: async () => "discard",
  });

  await harness.controller.closeOtherTabs(1);

  assert.equal(harness.state.openFiles.length, 1);
  assert.equal(harness.state.openFiles[0].path, "/tmp/b.md");
});

test("closeOtherTabs with single tab does nothing", async () => {
  const harness = createHarness({
    stateOverrides: {
      mode: "files",
      isDirty: false,
      openFiles: [makeTab("/tmp/a.md")],
      activeTabIndex: 0,
    },
    promptCloseDirty: async () => "discard",
  });

  await harness.controller.closeOtherTabs(0);

  assert.equal(harness.state.openFiles.length, 1);
  assert.equal(harness.renderCalls, 0);
});

test("closeOtherTabs keeps first tab when target is 0", async () => {
  const harness = createHarness({
    stateOverrides: {
      mode: "files",
      isDirty: false,
      openFiles: [
        makeTab("/tmp/a.md"),
        makeTab("/tmp/b.md"),
        makeTab("/tmp/c.md"),
      ],
      activeTabIndex: 0,
    },
    promptCloseDirty: async () => "discard",
  });

  await harness.controller.closeOtherTabs(0);

  assert.equal(harness.state.openFiles.length, 1);
  assert.equal(harness.state.openFiles[0].path, "/tmp/a.md");
});

test("closeOtherTabs keeps last tab when target is last index", async () => {
  const harness = createHarness({
    stateOverrides: {
      mode: "files",
      isDirty: false,
      openFiles: [
        makeTab("/tmp/a.md"),
        makeTab("/tmp/b.md"),
        makeTab("/tmp/c.md"),
      ],
      activeTabIndex: 2,
    },
    promptCloseDirty: async () => "discard",
  });

  await harness.controller.closeOtherTabs(2);

  assert.equal(harness.state.openFiles.length, 1);
  assert.equal(harness.state.openFiles[0].path, "/tmp/c.md");
});

test("closeTab keeps dirty tab open when close prompt is canceled", async () => {
  const harness = createHarness();

  await harness.controller.closeTab(0);

  assert.equal(harness.state.openFiles.length, 1);
  assert.equal(harness.renderCalls, 0);
  assert.equal(harness.menuCalls, 0);
});

test("closeSingleActiveFile clears non-folder state and reports closure", async () => {
  const harness = createHarness({
    stateOverrides: {
      mode: "file",
      openFiles: [],
    },
    promptCloseDirty: async () => "discard",
  });

  await harness.controller.closeSingleActiveFile();

  assert.equal(harness.state.mode, "empty");
  assert.equal(harness.state.activePath, null);
  assert.equal(harness.treeDirtyCalls, 1);
  assert.equal(harness.renderCalls, 1);
  assert.equal(harness.menuCalls, 1);
  assert.deepEqual(harness.statuses, [
    { message: "Closed a.md", isError: false },
  ]);
});
