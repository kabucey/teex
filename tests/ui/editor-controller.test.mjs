import test from "node:test";
import assert from "node:assert/strict";

import { buildMenuStatePayload, isEditableState, shouldAutosaveOnToggle } from "../../src/ui/editor-controller.js";

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
