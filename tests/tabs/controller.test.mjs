import test from "node:test";
import assert from "node:assert/strict";

import { buildTabFromPayload } from "../../src/tabs/controller.js";

test("buildTabFromPayload initializes clean tab state and markdown mode", () => {
  assert.deepEqual(
    buildTabFromPayload({
      path: "/a.md",
      content: "# a",
      kind: "markdown",
      writable: true,
    }),
    {
      path: "/a.md",
      content: "# a",
      kind: "markdown",
      writable: true,
      isDirty: false,
      markdownViewMode: "preview",
    },
  );

  assert.deepEqual(
    buildTabFromPayload({
      path: "/a.txt",
      content: "a",
      kind: "text",
      writable: false,
    }),
    {
      path: "/a.txt",
      content: "a",
      kind: "text",
      writable: false,
      isDirty: false,
      markdownViewMode: "edit",
    },
  );
});
