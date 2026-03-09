import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMenuStatePayload,
  createEditorController,
  isEditableState,
  shouldAutosaveOnToggle,
} from "../../src/ui/editor-controller.js";

test("isEditableState depends on active file and markdown mode", () => {
  assert.equal(isEditableState({ activePath: null }), false);
  assert.equal(
    isEditableState({ activePath: "/a.txt", activeKind: "text", markdownViewMode: "preview" }),
    true,
  );
  assert.equal(
    isEditableState({ activePath: "/a.md", activeKind: "markdown", markdownViewMode: "preview" }),
    false,
  );
  assert.equal(
    isEditableState({ activePath: "/a.md", activeKind: "markdown", markdownViewMode: "edit" }),
    true,
  );
});

test("shouldAutosaveOnToggle returns true only for saved dirty files", () => {
  assert.equal(shouldAutosaveOnToggle({ activePath: "/a.md", isDirty: true }), true);
  assert.equal(shouldAutosaveOnToggle({ activePath: null, isDirty: true }), false);
  assert.equal(shouldAutosaveOnToggle({ activePath: "/a.md", isDirty: false }), false);
  assert.equal(shouldAutosaveOnToggle({ activePath: null, isDirty: false }), false);
});

test("buildMenuStatePayload reflects folder and markdown toggles", () => {
  assert.deepEqual(
    buildMenuStatePayload({ mode: "folder", activeKind: "markdown" }),
    { canToggleSidebar: true, canToggleMarkdownMode: true },
  );
  assert.deepEqual(
    buildMenuStatePayload({ mode: "file", activeKind: "text" }),
    { canToggleSidebar: false, canToggleMarkdownMode: false },
  );
});

test("toggleMarkdownMode does not force editor focus when switching preview to edit", () => {
  const renderCalls = [];
  const state = {
    activePath: "/a.md",
    activeKind: "markdown",
    markdownViewMode: "preview",
    isDirty: false,
    mode: "file",
  };
  const controller = createEditorController({
    state,
    invoke: () => Promise.resolve(),
    setStatus: () => {},
    render: (options) => renderCalls.push(options),
    hasTabSession: () => false,
  });

  controller.toggleMarkdownMode();

  assert.equal(state.markdownViewMode, "edit");
  assert.equal(renderCalls.length, 1);
  assert.deepEqual(renderCalls[0], { focusEditor: false });
});

test("toggleMarkdownMode keeps editor focus behavior when switching edit to preview", () => {
  const renderCalls = [];
  const state = {
    activePath: "/a.md",
    activeKind: "markdown",
    markdownViewMode: "edit",
    isDirty: false,
    mode: "file",
  };
  const controller = createEditorController({
    state,
    invoke: () => Promise.resolve(),
    setStatus: () => {},
    render: (options) => renderCalls.push(options),
    hasTabSession: () => false,
  });

  controller.toggleMarkdownMode();

  assert.equal(state.markdownViewMode, "preview");
  assert.equal(renderCalls.length, 1);
  assert.deepEqual(renderCalls[0], { focusEditor: true });
});

test("toggleMarkdownMode autosaves dirty file when switching edit to preview", async () => {
  const invokeCalls = [];
  const state = {
    activePath: "/a.md",
    activeKind: "markdown",
    markdownViewMode: "edit",
    isDirty: true,
    isSaving: false,
    content: "# Hello",
    mode: "file",
    openFiles: [{ path: "/a.md", isDirty: true, content: "# Hello" }],
    activeTabIndex: 0,
  };
  const controller = createEditorController({
    state,
    invoke: (cmd, args) => {
      invokeCalls.push({ cmd, args });
      return Promise.resolve();
    },
    setStatus: () => {},
    render: () => {},
    hasTabSession: () => true,
  });

  controller.toggleMarkdownMode();

  assert.equal(state.markdownViewMode, "preview");
  const writeCall = invokeCalls.find((c) => c.cmd === "write_text_file");
  assert.ok(writeCall, "should call write_text_file on toggle");
  assert.equal(writeCall.args.path, "/a.md");
  assert.equal(writeCall.args.content, "# Hello");

  // Wait for async saveNow to complete
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(state.isDirty, false);
});
