import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTabDisambiguations } from "../../src/tabs/tab-disambiguation.js";

describe("buildTabDisambiguations", () => {
  it("returns empty map when no duplicates", () => {
    const tabs = [{ path: "/a/foo.js" }, { path: "/a/bar.js" }];
    const result = buildTabDisambiguations(tabs);
    assert.equal(result.size, 0);
  });

  it("returns empty map for single tab", () => {
    const tabs = [{ path: "/a/b/renderer.js" }];
    const result = buildTabDisambiguations(tabs);
    assert.equal(result.size, 0);
  });

  it("returns empty map for empty array", () => {
    assert.equal(buildTabDisambiguations([]).size, 0);
  });

  it("disambiguates two tabs with same filename, different parent dirs", () => {
    const tabs = [
      { path: "/project/src/ui/renderer.js" },
      { path: "/project/src/sidebar/renderer.js" },
    ];
    const result = buildTabDisambiguations(tabs);
    assert.equal(result.size, 2);
    assert.equal(result.get(0), "ui");
    assert.equal(result.get(1), "sidebar");
  });

  it("walks up to grandparent when parent dirs also match", () => {
    const tabs = [
      { path: "/project/a/utils/helpers.js" },
      { path: "/project/b/utils/helpers.js" },
    ];
    const result = buildTabDisambiguations(tabs);
    assert.equal(result.size, 2);
    assert.equal(result.get(0), "a/utils");
    assert.equal(result.get(1), "b/utils");
  });

  it("skips tabs with null paths", () => {
    const tabs = [
      { path: "/a/renderer.js" },
      { path: null },
      { path: "/b/renderer.js" },
    ];
    const result = buildTabDisambiguations(tabs);
    assert.equal(result.size, 2);
    assert.equal(result.get(0), "a");
    assert.equal(result.get(2), "b");
    assert.equal(result.has(1), false);
  });

  it("handles three tabs with same name, two sharing parent dir", () => {
    const tabs = [
      { path: "/project/x/lib/index.js" },
      { path: "/project/y/lib/index.js" },
      { path: "/project/z/other/index.js" },
    ];
    const result = buildTabDisambiguations(tabs);
    assert.equal(result.size, 3);
    // All three need depth 2 since x/lib and y/lib differ at depth 2, other differs at depth 1
    // But we need all unique: lib, lib, other — not unique at depth 1
    // At depth 2: x/lib, y/lib, z/other — all unique
    assert.equal(result.get(0), "x/lib");
    assert.equal(result.get(1), "y/lib");
    assert.equal(result.get(2), "z/other");
  });

  it("handles mixed duplicates and uniques", () => {
    const tabs = [
      { path: "/a/foo.js" },
      { path: "/b/bar.js" },
      { path: "/c/foo.js" },
    ];
    const result = buildTabDisambiguations(tabs);
    assert.equal(result.size, 2);
    assert.equal(result.get(0), "a");
    assert.equal(result.get(2), "c");
    assert.equal(result.has(1), false);
  });
});
