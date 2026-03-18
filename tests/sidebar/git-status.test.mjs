import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  didGitStatusChange,
  gitStatusClass,
  propagateFolderStatus,
} from "../../src/sidebar/git-status.js";

describe("propagateFolderStatus", () => {
  it("returns empty object for empty input", () => {
    assert.deepStrictEqual(propagateFolderStatus({}), {});
  });

  it("returns empty object for null/undefined", () => {
    assert.deepStrictEqual(propagateFolderStatus(null), {});
    assert.deepStrictEqual(propagateFolderStatus(undefined), {});
  });

  it("passes through root-level files unchanged", () => {
    const map = { "file.txt": "M" };
    const result = propagateFolderStatus(map);
    assert.deepStrictEqual(result, { "file.txt": "M" });
  });

  it("adds folder status for nested file", () => {
    const map = { "docs/guide.md": "M" };
    const result = propagateFolderStatus(map);
    assert.equal(result.docs, "M");
    assert.equal(result["docs/guide.md"], "M");
  });

  it("adds intermediate folder statuses for deeply nested file", () => {
    const map = { "src/ui/renderer.js": "A" };
    const result = propagateFolderStatus(map);
    assert.equal(result.src, "M");
    assert.equal(result["src/ui"], "M");
    assert.equal(result["src/ui/renderer.js"], "A");
  });

  it("does not overwrite existing folder status", () => {
    const map = {
      "src/a.js": "M",
      "src/b.js": "D",
    };
    const result = propagateFolderStatus(map);
    assert.equal(result.src, "M");
  });

  it("handles multiple files in different folders", () => {
    const map = {
      "docs/a.md": "M",
      "src/b.js": "?",
    };
    const result = propagateFolderStatus(map);
    assert.equal(result.docs, "M");
    assert.equal(result.src, "M");
  });
});

describe("didGitStatusChange", () => {
  it("returns false for same reference", () => {
    const map = { "a.txt": "M" };
    assert.equal(didGitStatusChange(map, map), false);
  });

  it("returns false for equal maps", () => {
    const a = { "a.txt": "M", "b.txt": "D" };
    const b = { "a.txt": "M", "b.txt": "D" };
    assert.equal(didGitStatusChange(a, b), false);
  });

  it("returns true when key count differs", () => {
    const a = { "a.txt": "M" };
    const b = { "a.txt": "M", "b.txt": "D" };
    assert.equal(didGitStatusChange(a, b), true);
  });

  it("returns true when value differs", () => {
    const a = { "a.txt": "M" };
    const b = { "a.txt": "D" };
    assert.equal(didGitStatusChange(a, b), true);
  });

  it("returns true when prev is null", () => {
    assert.equal(didGitStatusChange(null, {}), true);
  });

  it("returns true when next is null", () => {
    assert.equal(didGitStatusChange({}, null), true);
  });

  it("returns false for two empty maps", () => {
    assert.equal(didGitStatusChange({}, {}), false);
  });
});

describe("gitStatusClass", () => {
  it("returns git-modified for M", () => {
    assert.equal(gitStatusClass("M"), "git-modified");
  });

  it("returns git-added for A", () => {
    assert.equal(gitStatusClass("A"), "git-added");
  });

  it("returns git-deleted for D", () => {
    assert.equal(gitStatusClass("D"), "git-deleted");
  });

  it("returns git-untracked for ?", () => {
    assert.equal(gitStatusClass("?"), "git-untracked");
  });

  it("returns git-renamed for R", () => {
    assert.equal(gitStatusClass("R"), "git-renamed");
  });

  it("returns empty string for unknown status", () => {
    assert.equal(gitStatusClass("X"), "");
  });
});
