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
