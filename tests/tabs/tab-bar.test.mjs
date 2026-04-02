import assert from "node:assert/strict";
import test from "node:test";

import { getTabPath } from "../../src/tabs/tab-bar.js";

test("getTabPath returns null when no files and no activePath", () => {
  const state = { openFiles: [], activePath: null };
  assert.equal(getTabPath(state, 0), null);
});

test("getTabPath returns activePath when openFiles is empty", () => {
  const state = { openFiles: [], activePath: "/project/file.md" };
  assert.equal(getTabPath(state, 0), "/project/file.md");
});

test("getTabPath returns path for the given index", () => {
  const state = {
    openFiles: [{ path: "/project/a.md" }, { path: "/project/b.md" }],
    activePath: "/project/a.md",
  };
  assert.equal(getTabPath(state, 0), "/project/a.md");
  assert.equal(getTabPath(state, 1), "/project/b.md");
});

test("getTabPath returns null for a tab with no path (e.g. diff tab)", () => {
  const state = {
    openFiles: [{ path: null, kind: "diff" }],
    activePath: null,
  };
  assert.equal(getTabPath(state, 0), null);
});

test("getTabPath returns null for out-of-range index", () => {
  const state = { openFiles: [{ path: "/project/a.md" }], activePath: null };
  assert.equal(getTabPath(state, 5), null);
});
