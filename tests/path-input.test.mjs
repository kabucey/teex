import test from "node:test";
import assert from "node:assert/strict";

import {
  extractDragDropPaths,
  hasFileDragData,
  normalizeIncomingPaths,
} from "../src/path-input.js";

test("normalizeIncomingPaths filters blanks, non-strings, and duplicates", () => {
  assert.deepEqual(
    normalizeIncomingPaths(["/a", "", " ", "/a", 123, "/b"]),
    ["/a", "/b"],
  );
  assert.deepEqual(normalizeIncomingPaths(null), []);
});

test("extractDragDropPaths supports array and payload.paths forms", () => {
  assert.deepEqual(extractDragDropPaths(["/a", "/a"]), ["/a"]);
  assert.deepEqual(extractDragDropPaths({ paths: ["/b", "", "/c"] }), ["/b", "/c"]);
  assert.deepEqual(extractDragDropPaths({ nope: true }), []);
});

test("hasFileDragData detects file drags from dataTransfer types", () => {
  assert.equal(hasFileDragData({ dataTransfer: { types: ["Files", "text/plain"] } }), true);
  assert.equal(hasFileDragData({ dataTransfer: { types: ["text/plain"] } }), false);
  assert.equal(hasFileDragData(null), false);
});
