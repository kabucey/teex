import test from "node:test";
import assert from "node:assert/strict";

import { createCrossWindowDragController } from "../../src/tabs/cross-window-drag-controller.js";

// Minimal DOM stubs for Node test environment
globalThis.window = { devicePixelRatio: 2 };

function createHarness({ invokeResults = {} } = {}) {
  const state = {
    windowLabel: "teex-window-1",
    mode: "files",
    activePath: "/tmp/test.md",
    activeKind: "markdown",
    content: "hello",
    isDirty: false,
    markdownViewMode: "preview",
    activeEditorScrollTop: 0,
    activePreviewScrollTop: 0,
    openFiles: [
      {
        path: "/tmp/test.md",
        content: "hello",
        kind: "markdown",
        writable: true,
        isDirty: false,
        markdownViewMode: "preview",
        scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
      },
      {
        path: "/tmp/other.txt",
        content: "world",
        kind: "text",
        writable: true,
        isDirty: false,
        markdownViewMode: "edit",
        scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
      },
    ],
    activeTabIndex: 0,
  };

  const calls = [];
  const pendingOutgoingTabTransfers = new Map();
  let renderCount = 0;

  async function invoke(command, args) {
    calls.push({ command, args });
    if (invokeResults[command] !== undefined) {
      const result = invokeResults[command];
      return typeof result === "function" ? result(args) : result;
    }
    return undefined;
  }

  const el = {
    tabBar: {
      classList: {
        _classes: new Set(),
        add(c) { this._classes.add(c); },
        remove(c) { this._classes.delete(c); },
        toggle(c, force) { force ? this._classes.add(c) : this._classes.delete(c); },
      },
    },
  };

  const controller = createCrossWindowDragController({
    state,
    pendingOutgoingTabTransfers,
    invoke,
    el,
    render: () => { renderCount++; },
    setStatus: () => {},
    updateMenuState: () => {},
    markSidebarTreeDirty: () => {},
  });

  return { state, controller, calls, pendingOutgoingTabTransfers, getRenderCount: () => renderCount };
}

test("reportPosition shows preview with content when no target window found", async () => {
  const { controller, calls } = createHarness({
    invokeResults: { report_drag_position: null },
  });

  controller.activate(0);
  await controller.reportPosition(400, 300);

  const previewCalls = calls.filter((c) => c.command === "show_tab_drag_preview");
  assert.equal(previewCalls.length, 1);
  assert.equal(previewCalls[0].args.physicalX, 800);
  assert.equal(previewCalls[0].args.physicalY, 600);
  assert.equal(previewCalls[0].args.title, "test.md");
  assert.equal(previewCalls[0].args.content, "hello");
});

test("reportPosition hides preview when target window found", async () => {
  const { controller, calls } = createHarness({
    invokeResults: { report_drag_position: "teex-window-2" },
  });

  controller.activate(0);
  await controller.reportPosition(400, 300);

  const showCalls = calls.filter((c) => c.command === "show_tab_drag_preview");
  const hideCalls = calls.filter((c) => c.command === "hide_tab_drag_preview");
  assert.equal(showCalls.length, 0);
  assert.equal(hideCalls.length, 0);
  assert.equal(controller.currentTargetLabel(), "teex-window-2");
});

test("reportPosition hides preview when switching from no-target to target", async () => {
  let callCount = 0;
  const { controller, calls } = createHarness({
    invokeResults: {
      report_drag_position: () => {
        callCount++;
        return callCount === 1 ? null : "teex-window-2";
      },
    },
  });

  controller.activate(0);
  await controller.reportPosition(400, 300);

  const showCalls = calls.filter((c) => c.command === "show_tab_drag_preview");
  assert.equal(showCalls.length, 1);

  await controller.reportPosition(500, 400);

  const hideCalls = calls.filter((c) => c.command === "hide_tab_drag_preview");
  assert.equal(hideCalls.length, 1);
});

test("cancel hides preview and clears drag hover", async () => {
  const { controller, calls } = createHarness({
    invokeResults: { report_drag_position: null },
  });

  controller.activate(0);
  await controller.reportPosition(400, 300);
  await controller.cancel();

  const hideCalls = calls.filter((c) => c.command === "hide_tab_drag_preview");
  assert.ok(hideCalls.length >= 1);

  const cancelCalls = calls.filter((c) => c.command === "cancel_cross_window_drag_hover");
  assert.ok(cancelCalls.length >= 1);
});

test("completeDropAsNewWindow creates window with path and removes source tab", async () => {
  const { state, controller, calls, getRenderCount } = createHarness({
    invokeResults: {
      report_drag_position: null,
      create_window_from_drag: "teex-window-new",
    },
  });

  assert.equal(state.openFiles.length, 2);
  controller.activate(0);
  await controller.completeDropAsNewWindow(400, 300);

  const createCalls = calls.filter((c) => c.command === "create_window_from_drag");
  assert.equal(createCalls.length, 1);
  assert.equal(createCalls[0].args.physicalX, 800);
  assert.equal(createCalls[0].args.physicalY, 600);
  assert.equal(createCalls[0].args.path, "/tmp/test.md");

  // No route_tab_transfer — uses path queuing instead
  const transferCalls = calls.filter((c) => c.command === "route_tab_transfer");
  assert.equal(transferCalls.length, 0);

  // Source tab removed
  assert.equal(state.openFiles.length, 1);
  assert.equal(state.openFiles[0].path, "/tmp/other.txt");
  assert.ok(getRenderCount() > 0);
});

test("completeDropAsNewWindow cancels for untitled tabs (no path)", async () => {
  const { state, controller, calls } = createHarness({
    invokeResults: {
      create_window_from_drag: "teex-window-new",
    },
  });

  state.openFiles[0].path = null;
  controller.activate(0);
  await controller.completeDropAsNewWindow(400, 300);

  const createCalls = calls.filter((c) => c.command === "create_window_from_drag");
  assert.equal(createCalls.length, 0);
  assert.equal(state.openFiles.length, 2);
});

test("completeDropAsNewWindow does not remove tab when window creation fails", async () => {
  const statusMessages = [];
  const state = {
    windowLabel: "teex-window-1",
    mode: "files",
    activePath: "/tmp/test.md",
    activeKind: "markdown",
    content: "hello",
    isDirty: false,
    markdownViewMode: "preview",
    activeEditorScrollTop: 0,
    activePreviewScrollTop: 0,
    openFiles: [
      {
        path: "/tmp/test.md",
        content: "hello",
        kind: "markdown",
        writable: true,
        isDirty: false,
        markdownViewMode: "preview",
        scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
      },
    ],
    activeTabIndex: 0,
  };

  const pendingOutgoingTabTransfers = new Map();

  const controller = createCrossWindowDragController({
    state,
    pendingOutgoingTabTransfers,
    invoke: async (command) => {
      if (command === "create_window_from_drag") {
        throw new Error("window creation failed");
      }
    },
    el: {
      tabBar: {
        classList: {
          _classes: new Set(),
          add(c) { this._classes.add(c); },
          remove(c) { this._classes.delete(c); },
          toggle(c, force) { force ? this._classes.add(c) : this._classes.delete(c); },
        },
      },
    },
    render: () => {},
    setStatus: (msg) => statusMessages.push(msg),
    updateMenuState: () => {},
    markSidebarTreeDirty: () => {},
  });

  controller.activate(0);
  await controller.completeDropAsNewWindow(400, 300);

  assert.equal(state.openFiles.length, 1);
  assert.ok(statusMessages.some((m) => m.includes("window creation failed")));
});

test("removeTabFromSource clears state when last tab removed in non-folder mode", async () => {
  const { state, controller } = createHarness({
    invokeResults: {
      create_window_from_drag: "teex-window-new",
    },
  });

  state.openFiles = [state.openFiles[0]];
  controller.activate(0);
  await controller.completeDropAsNewWindow(400, 300);

  assert.equal(state.openFiles.length, 0);
  assert.equal(state.mode, "empty");
  assert.equal(state.activePath, null);
});
