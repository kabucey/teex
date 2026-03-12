import assert from "node:assert/strict";
import test from "node:test";

import { createCrossWindowDragSession } from "../../src/tabs/cross-window-drag-session.js";

test("drag session tracks tab activation and reset", () => {
  const session = createCrossWindowDragSession();

  session.activate(2);
  assert.equal(session.isActive(), true);
  assert.equal(session.fromIndex, 2);
  assert.equal(session.dragMode, "tab");

  const snapshot = session.snapshotAndReset();
  assert.equal(snapshot.fromIndex, 2);
  assert.equal(session.isActive(), false);
});

test("drag session seeds path preview info when activated for path", () => {
  const session = createCrossWindowDragSession();

  session.activateForPath("/tmp/readme.md");
  assert.equal(session.dragMode, "path");
  assert.equal(session.dragPath, "/tmp/readme.md");
  assert.equal(session.dragPreviewInfo.title, "readme.md");

  session.setPreviewInfo({ title: "readme.md", content: "loaded" });
  assert.equal(session.dragPreviewInfo.content, "loaded");
});
