import test from "node:test";
import assert from "node:assert/strict";

import { didProjectEntriesChange } from "../../src/files/controller.js";

test("didProjectEntriesChange detects path and relPath changes", () => {
  const a = [
    { path: "/p/a.md", relPath: "a.md" },
    { path: "/p/b.md", relPath: "b.md" },
  ];

  assert.equal(didProjectEntriesChange(a, [...a]), false);
  assert.equal(didProjectEntriesChange(a, [{ path: "/p/a.md", relPath: "a.md" }]), true);
  assert.equal(
    didProjectEntriesChange(a, [
      { path: "/p/a.md", relPath: "a.md" },
      { path: "/p/c.md", relPath: "c.md" },
    ]),
    true,
  );
  assert.equal(
    didProjectEntriesChange(a, [
      { path: "/p/a.md", relPath: "a.md" },
      { path: "/p/b.md", relPath: "renamed/b.md" },
    ]),
    true,
  );
});
