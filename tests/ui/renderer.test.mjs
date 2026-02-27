import test from "node:test";
import assert from "node:assert/strict";

import { buildWindowTitleState } from "../../src/ui/renderer.js";

test("buildWindowTitleState postfixes dirty saved file titles", () => {
  assert.deepEqual(
    buildWindowTitleState({
      mode: "file",
      rootPath: null,
      activePath: "/notes/today.md",
      isDirty: true,
      openFiles: [],
      activeTabIndex: 0,
    }),
    {
      nextTitle: "today.md  ●",
      nextRepresentedPath: "/notes/today.md",
    },
  );
});

test("buildWindowTitleState postfixes dirty untitled tab titles", () => {
  assert.deepEqual(
    buildWindowTitleState({
      mode: "files",
      rootPath: null,
      activePath: null,
      isDirty: true,
      openFiles: [{ path: null }],
      activeTabIndex: 0,
    }),
    {
      nextTitle: "Untitled  ●",
      nextRepresentedPath: null,
    },
  );
});

test("buildWindowTitleState keeps clean titles unchanged", () => {
  assert.deepEqual(
    buildWindowTitleState({
      mode: "file",
      rootPath: null,
      activePath: "/notes/today.md",
      isDirty: false,
      openFiles: [],
      activeTabIndex: 0,
    }),
    {
      nextTitle: "today.md",
      nextRepresentedPath: "/notes/today.md",
    },
  );
});
