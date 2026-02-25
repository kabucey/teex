import test from "node:test";
import assert from "node:assert/strict";

import { baseName, clamp } from "../src/app-utils.js";

test("baseName handles unix and windows style paths", () => {
  assert.equal(baseName("/tmp/example.txt"), "example.txt");
  assert.equal(baseName("C:\\Users\\kel\\note.md"), "note.md");
});

test("clamp constrains values to range", () => {
  assert.equal(clamp(10, 0, 5), 5);
  assert.equal(clamp(-1, 0, 5), 0);
  assert.equal(clamp(3, 0, 5), 3);
});
