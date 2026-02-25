import test from "node:test";
import assert from "node:assert/strict";

import {
  applyFilePayloadToState,
  clearActiveFileInState,
  flushStateToActiveTabInState,
  hasTabSession,
  normalizeTransferTab,
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
    saveTimer: null,
    ...overrides,
  };
}

test("normalizeTransferTab sanitizes invalid and partial tab records", () => {
  assert.equal(normalizeTransferTab(null), null);
  assert.equal(normalizeTransferTab({ path: "" }), null);

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
      writable: false,
      isDirty: true,
      markdownViewMode: "edit",
    },
  );

  assert.deepEqual(
    normalizeTransferTab({ path: "/a.bin", kind: "other" }),
    {
      path: "/a.bin",
      kind: "text",
      content: "",
      writable: true,
      isDirty: false,
      markdownViewMode: "edit",
    },
  );
});

test("apply/clear file payload updates active state and markdown mode", () => {
  const state = makeState({
    activeKind: "markdown",
    markdownViewMode: "edit",
    saveTimer: setTimeout(() => {}, 1000),
  });

  applyFilePayloadToState(state, {
    path: "/a.md",
    kind: "markdown",
    content: "# x",
  }, { defaultMarkdownMode: "preview" });
  assert.equal(state.activePath, "/a.md");
  assert.equal(state.markdownViewMode, "edit");
  assert.equal(state.isDirty, false);
  assert.equal(state.saveTimer, null);

  applyFilePayloadToState(state, {
    path: "/a.txt",
    kind: "text",
    content: "x",
  }, { defaultMarkdownMode: "preview" });
  assert.equal(state.markdownViewMode, "edit");

  state.saveTimer = setTimeout(() => {}, 1000);
  clearActiveFileInState(state);
  assert.equal(state.activePath, null);
  assert.equal(state.activeKind, null);
  assert.equal(state.content, "");
  assert.equal(state.markdownViewMode, "preview");
  assert.equal(state.saveTimer, null);
});

test("flush/sync active tab mirror state and tabs", () => {
  const state = makeState({
    openFiles: [{ path: "/a.md", kind: "markdown", content: "old", isDirty: false, markdownViewMode: "preview" }],
    activePath: "/a.md",
    activeKind: "markdown",
    content: "new",
    isDirty: true,
    markdownViewMode: "edit",
  });

  flushStateToActiveTabInState(state);
  assert.equal(state.openFiles[0].content, "new");
  assert.equal(state.openFiles[0].isDirty, true);
  assert.equal(state.openFiles[0].markdownViewMode, "edit");

  state.content = "";
  state.isDirty = false;
  state.markdownViewMode = "preview";
  state.saveTimer = setTimeout(() => {}, 1000);
  syncActiveTabToStateFromTabs(state);
  assert.equal(state.content, "new");
  assert.equal(state.isDirty, true);
  assert.equal(state.markdownViewMode, "edit");
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
  });
  assert.equal(hasTabSession(single), false);
  assert.deepEqual(snapshotActiveFileAsTransferTab(single), {
    path: "/one.md",
    content: "# One",
    kind: "markdown",
    writable: true,
    isDirty: true,
    markdownViewMode: "edit",
  });
  assert.deepEqual(snapshotAllOpenTabsForTransfer(single), {
    kind: "single",
    tabs: [snapshotActiveFileAsTransferTab(single)],
    singlePath: "/one.md",
  });

  const tabs = makeState({
    openFiles: [
      { path: "/a.md", kind: "markdown", content: "A", isDirty: false, markdownViewMode: "preview" },
      { path: "/b.txt", kind: "text", content: "B", isDirty: false, markdownViewMode: "edit" },
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
  assert.equal(snapshot.singlePath, null);
});
