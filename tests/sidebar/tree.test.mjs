import test from "node:test";
import assert from "node:assert/strict";

import { buildEntryTree, collectFolderPaths, renderTreeHtml } from "../../src/sidebar/tree.js";

test("buildEntryTree groups nested folders and files", () => {
  const tree = buildEntryTree([
    { path: "/root/a.md", relPath: "a.md" },
    { path: "/root/docs/guide.md", relPath: "docs/guide.md" },
    { path: "/root/docs/api/ref.md", relPath: "docs/api/ref.md" },
  ]);

  assert.equal(tree.files.length, 1);
  assert.equal(tree.files[0].name, "a.md");
  assert.equal(tree.folders.has("docs"), true);
  assert.equal(tree.folders.get("docs").folders.has("api"), true);
});

test("collectFolderPaths returns all nested folder segments", () => {
  const folders = collectFolderPaths([
    { relPath: "docs/guide.md" },
    { relPath: "docs/api/ref.md" },
    { relPath: "a.md" },
  ]);

  assert.deepEqual([...folders].sort(), ["docs", "docs/api"]);
});

test("renderTreeHtml renders folders/files and respects collapsed set", () => {
  const tree = buildEntryTree([
    { path: "/root/docs/guide.md", relPath: "docs/guide.md" },
    { path: "/root/a.md", relPath: "a.md" },
  ]);

  const expandedHtml = renderTreeHtml(tree, 0, new Set());
  assert.match(expandedHtml, /folder-toggle/);
  assert.match(expandedHtml, /project-item/);
  assert.match(expandedHtml, /guide\.md/);

  const collapsedHtml = renderTreeHtml(tree, 0, new Set(["docs"]));
  assert.match(collapsedHtml, /aria-expanded="false"/);
  assert.doesNotMatch(collapsedHtml, /guide\.md/);
});
