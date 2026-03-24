import assert from "node:assert/strict";
import test from "node:test";

import {
  baseName,
  clamp,
  dirName,
  isCursorOutsideWindow,
} from "../../src/utils/app-utils.js";

globalThis.window = { innerWidth: 800, innerHeight: 600 };

test("baseName handles unix and windows style paths", () => {
  assert.equal(baseName("/tmp/example.txt"), "example.txt");
  assert.equal(baseName("C:\\Users\\kel\\note.md"), "note.md");
});

test("clamp constrains values to range", () => {
  assert.equal(clamp(10, 0, 5), 5);
  assert.equal(clamp(-1, 0, 5), 0);
  assert.equal(clamp(3, 0, 5), 3);
});

test("dirName returns parent directory for unix and windows paths", () => {
  assert.equal(dirName("/tmp/example.txt"), "/tmp");
  assert.equal(dirName("C:\\Users\\kel\\note.md"), "C:/Users/kel");
  assert.equal(dirName("/Users/kel/docs/readme.md"), "/Users/kel/docs");
});

test("dirName returns dot for bare filename", () => {
  assert.equal(dirName("file.txt"), ".");
});

test("isCursorOutsideWindow detects out-of-bounds coordinates", () => {
  assert.equal(isCursorOutsideWindow(400, 300), false);
  assert.equal(isCursorOutsideWindow(0, 0), false);
  assert.equal(isCursorOutsideWindow(-1, 300), true);
  assert.equal(isCursorOutsideWindow(400, -1), true);
  assert.equal(isCursorOutsideWindow(801, 300), true);
  assert.equal(isCursorOutsideWindow(400, 601), true);
});
