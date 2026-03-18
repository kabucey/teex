import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCollapsedFoldersFromExpanded,
  buildEntryTree,
  collectFolderPaths,
  hasFoldersInEntries,
  isAllCollapsed,
  parentFolderPaths,
  renderTreeHtml,
} from "../../src/sidebar/tree.js";

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

test("hasFoldersInEntries returns false for flat entries", () => {
  assert.equal(
    hasFoldersInEntries([{ relPath: "a.md" }, { relPath: "b.txt" }]),
    false,
  );
});

test("hasFoldersInEntries returns true for nested entries", () => {
  assert.equal(
    hasFoldersInEntries([{ relPath: "a.md" }, { relPath: "docs/guide.md" }]),
    true,
  );
});

test("isAllCollapsed returns true when all folder paths are collapsed", () => {
  const entries = [
    { relPath: "docs/guide.md" },
    { relPath: "docs/api/ref.md" },
    { relPath: "a.md" },
  ];
  const collapsedFolders = new Set(["docs", "docs/api"]);
  assert.equal(isAllCollapsed(entries, collapsedFolders), true);
});

test("isAllCollapsed returns false when some folders are expanded", () => {
  const entries = [
    { relPath: "docs/guide.md" },
    { relPath: "docs/api/ref.md" },
    { relPath: "a.md" },
  ];
  const collapsedFolders = new Set(["docs"]);
  assert.equal(isAllCollapsed(entries, collapsedFolders), false);
});

test("isAllCollapsed returns true for empty entries (no folders)", () => {
  assert.equal(isAllCollapsed([], new Set()), true);
  assert.equal(isAllCollapsed([{ relPath: "a.md" }], new Set()), true);
});

test("buildCollapsedFoldersFromExpanded restores only unexpanded folders", () => {
  const entries = [
    { path: "/root/docs/guide.md", relPath: "docs/guide.md" },
    { path: "/root/docs/api/ref.md", relPath: "docs/api/ref.md" },
    { path: "/root/src/index.js", relPath: "src/index.js" },
  ];

  const collapsedFolders = buildCollapsedFoldersFromExpanded(
    entries,
    new Set(["docs"]),
  );

  assert.deepEqual([...collapsedFolders].sort(), ["docs/api", "src"]);
});

test("buildCollapsedFoldersFromExpanded collapses all folders for empty expansion set", () => {
  const entries = [
    { path: "/root/docs/guide.md", relPath: "docs/guide.md" },
    { path: "/root/src/index.js", relPath: "src/index.js" },
  ];

  const collapsedFolders = buildCollapsedFoldersFromExpanded(
    entries,
    new Set(),
  );

  assert.deepEqual([...collapsedFolders].sort(), ["docs", "src"]);
});

test("collapse-all: renderTreeHtml with all folders collapsed hides nested files", () => {
  const entries = [
    { path: "/root/docs/guide.md", relPath: "docs/guide.md" },
    { path: "/root/docs/api/ref.md", relPath: "docs/api/ref.md" },
    { path: "/root/a.md", relPath: "a.md" },
  ];
  const allFolders = collectFolderPaths(entries);
  const tree = buildEntryTree(entries);
  const html = renderTreeHtml(tree, 0, allFolders);

  assert.match(html, /a\.md/);
  assert.doesNotMatch(html, /guide\.md/);
  assert.doesNotMatch(html, /ref\.md/);
});

test("expand-all: renderTreeHtml with empty collapsedFolders shows all nested files", () => {
  const entries = [
    { path: "/root/docs/guide.md", relPath: "docs/guide.md" },
    { path: "/root/docs/api/ref.md", relPath: "docs/api/ref.md" },
    { path: "/root/a.md", relPath: "a.md" },
  ];
  const tree = buildEntryTree(entries);
  const html = renderTreeHtml(tree, 0, new Set());

  assert.match(html, /a\.md/);
  assert.match(html, /guide\.md/);
  assert.match(html, /ref\.md/);
  assert.doesNotMatch(html, /aria-expanded="false"/);
});

test("parentFolderPaths returns parent folder segments for a nested entry", () => {
  const entries = [
    { path: "/root/docs/api/ref.md", relPath: "docs/api/ref.md" },
    { path: "/root/a.md", relPath: "a.md" },
  ];
  const result = parentFolderPaths(entries, "/root/docs/api/ref.md");
  assert.deepEqual([...result].sort(), ["docs", "docs/api"]);
});

test("parentFolderPaths returns empty set for root-level file", () => {
  const entries = [{ path: "/root/a.md", relPath: "a.md" }];
  const result = parentFolderPaths(entries, "/root/a.md");
  assert.deepEqual([...result], []);
});

test("parentFolderPaths returns empty set when path is not in entries", () => {
  const entries = [{ path: "/root/a.md", relPath: "a.md" }];
  const result = parentFolderPaths(entries, "/other/b.md");
  assert.deepEqual([...result], []);
});

test("folder buttons do not have a static title attribute", () => {
  const tree = buildEntryTree([
    { path: "/root/docs/guide.md", relPath: "docs/guide.md" },
  ]);

  const html = renderTreeHtml(tree, 0, new Set());
  assert.doesNotMatch(html, /folder-toggle[^>]*title="/);
});

test("renderTreeHtml adds git-modified class and badge for modified files", () => {
  const tree = buildEntryTree([
    { path: "/root/a.md", relPath: "a.md" },
    { path: "/root/b.md", relPath: "b.md" },
  ]);
  const gitStatusMap = { "a.md": "M" };
  const html = renderTreeHtml(tree, 0, new Set(), gitStatusMap);

  assert.match(html, /project-item git-modified/);
  assert.match(html, /class="git-badge">M<\/span>/);
  // b.md should not have a git class
  assert.doesNotMatch(html, /b\.md.*git-modified/);
});

test("renderTreeHtml adds git-untracked class and badge for untracked files", () => {
  const tree = buildEntryTree([{ path: "/root/new.txt", relPath: "new.txt" }]);
  const gitStatusMap = { "new.txt": "?" };
  const html = renderTreeHtml(tree, 0, new Set(), gitStatusMap);

  assert.match(html, /project-item git-untracked/);
  assert.match(html, /class="git-badge">\?<\/span>/);
});

test("renderTreeHtml adds git class to folders from propagated status", () => {
  const tree = buildEntryTree([
    { path: "/root/docs/guide.md", relPath: "docs/guide.md" },
  ]);
  const gitStatusMap = { docs: "M", "docs/guide.md": "M" };
  const html = renderTreeHtml(tree, 0, new Set(), gitStatusMap);

  assert.match(html, /folder-toggle git-modified/);
});

test("renderTreeHtml renders no git attributes when gitStatusMap is empty", () => {
  const tree = buildEntryTree([{ path: "/root/a.md", relPath: "a.md" }]);
  const html = renderTreeHtml(tree, 0, new Set(), {});

  assert.doesNotMatch(html, /git-modified/);
  assert.doesNotMatch(html, /git-badge/);
});

test("renderTreeHtml works without gitStatusMap argument (backward compat)", () => {
  const tree = buildEntryTree([{ path: "/root/a.md", relPath: "a.md" }]);
  const html = renderTreeHtml(tree, 0, new Set());

  assert.match(html, /project-item/);
  assert.doesNotMatch(html, /git-badge/);
});
