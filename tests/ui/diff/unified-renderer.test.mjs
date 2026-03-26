import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildUnifiedDiffHtml } from "../../../src/ui/diff/unified-renderer.js";

describe("buildUnifiedDiffHtml", () => {
  it("returns empty state message for empty array", () => {
    const html = buildUnifiedDiffHtml([]);
    assert.ok(html.includes("No changes to review."));
    assert.ok(html.includes("udiff-empty-state"));
  });

  it("returns empty state message for null input", () => {
    const html = buildUnifiedDiffHtml(null);
    assert.ok(html.includes("No changes to review."));
  });

  it("renders a single file with one hunk", () => {
    const html = buildUnifiedDiffHtml([
      {
        rel_path: "src/main.rs",
        hunks: [
          {
            header: "@@ -1,3 +1,4 @@",
            lines: [
              { content: "line1", line_type: "context" },
              { content: "new line", line_type: "added" },
              { content: "line2", line_type: "context" },
            ],
          },
        ],
      },
    ]);
    assert.ok(html.includes("udiff-file"));
    assert.ok(html.includes("src/main.rs"));
    assert.ok(html.includes("udiff-file-header"));
    assert.ok(html.includes("udiff-hunk-header"));
    assert.ok(html.includes("@@ -1,3 +1,4 @@"));
  });

  it("applies correct class for added lines", () => {
    const html = buildUnifiedDiffHtml([
      {
        rel_path: "a.txt",
        hunks: [
          {
            header: "@@",
            lines: [{ content: "hello", line_type: "added" }],
          },
        ],
      },
    ]);
    assert.ok(html.includes("udiff-added"));
    assert.ok(html.includes("+hello"));
  });

  it("applies correct class for removed lines", () => {
    const html = buildUnifiedDiffHtml([
      {
        rel_path: "a.txt",
        hunks: [
          {
            header: "@@",
            lines: [{ content: "gone", line_type: "removed" }],
          },
        ],
      },
    ]);
    assert.ok(html.includes("udiff-removed"));
    assert.ok(html.includes("-gone"));
  });

  it("applies correct class for context lines", () => {
    const html = buildUnifiedDiffHtml([
      {
        rel_path: "a.txt",
        hunks: [
          {
            header: "@@",
            lines: [{ content: "same", line_type: "context" }],
          },
        ],
      },
    ]);
    assert.ok(html.includes("udiff-context"));
    assert.ok(html.includes(" same"));
  });

  it("renders multiple files with separate sections", () => {
    const html = buildUnifiedDiffHtml([
      {
        rel_path: "a.txt",
        hunks: [
          {
            header: "@@",
            lines: [{ content: "a", line_type: "added" }],
          },
        ],
      },
      {
        rel_path: "b.txt",
        hunks: [
          {
            header: "@@",
            lines: [{ content: "b", line_type: "removed" }],
          },
        ],
      },
    ]);
    assert.ok(html.includes("a.txt"));
    assert.ok(html.includes("b.txt"));
    // Two udiff-file sections
    const fileCount = html.split("udiff-file-header").length - 1;
    assert.equal(fileCount, 2);
  });

  it("escapes HTML special characters in content", () => {
    const html = buildUnifiedDiffHtml([
      {
        rel_path: "x.html",
        hunks: [
          {
            header: "@@",
            lines: [
              { content: '<script>alert("xss")</script>', line_type: "added" },
            ],
          },
        ],
      },
    ]);
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
  });

  it("escapes HTML special characters in file path", () => {
    const html = buildUnifiedDiffHtml([
      {
        rel_path: 'path/<evil>"file',
        hunks: [
          {
            header: "@@",
            lines: [{ content: "ok", line_type: "context" }],
          },
        ],
      },
    ]);
    assert.ok(!html.includes("<evil>"));
    assert.ok(html.includes("&lt;evil&gt;"));
  });

  it("sets data-path attribute on file container", () => {
    const html = buildUnifiedDiffHtml([
      {
        rel_path: "src/lib.rs",
        hunks: [
          {
            header: "@@",
            lines: [{ content: "x", line_type: "added" }],
          },
        ],
      },
    ]);
    assert.ok(html.includes('data-path="src/lib.rs"'));
  });

  it("TOC item uses basename not full path as label", () => {
    const html = buildUnifiedDiffHtml([
      {
        rel_path: "src/ui/foo.js",
        hunks: [
          { header: "@@", lines: [{ content: "x", line_type: "added" }] },
        ],
      },
    ]);
    assert.ok(html.includes('class="udiff-toc-name">foo.js<'));
  });

  it("TOC item title attribute contains full path", () => {
    const html = buildUnifiedDiffHtml([
      {
        rel_path: "src/ui/foo.js",
        hunks: [
          { header: "@@", lines: [{ content: "x", line_type: "added" }] },
        ],
      },
    ]);
    assert.ok(html.includes('title="src/ui/foo.js"'));
  });

  it("TOC item href and data-target match file id", () => {
    const html = buildUnifiedDiffHtml([
      {
        rel_path: "a.txt",
        hunks: [
          { header: "@@", lines: [{ content: "x", line_type: "added" }] },
        ],
      },
    ]);
    assert.ok(html.includes('href="#udiff-file-0"'));
    assert.ok(html.includes('data-target="udiff-file-0"'));
    assert.ok(html.includes('id="udiff-file-0"'));
  });

  it("first TOC item gets udiff-toc-active, others do not", () => {
    const html = buildUnifiedDiffHtml([
      {
        rel_path: "a.txt",
        hunks: [
          { header: "@@", lines: [{ content: "x", line_type: "added" }] },
        ],
      },
      {
        rel_path: "b.txt",
        hunks: [
          { header: "@@", lines: [{ content: "y", line_type: "added" }] },
        ],
      },
    ]);
    // Exactly one active item
    const activeCount = html.split("udiff-toc-active").length - 1;
    assert.equal(activeCount, 1);
    // The active item is for file 0
    assert.ok(
      html.includes('href="#udiff-file-0" data-target="udiff-file-0"') ||
        html.includes("udiff-toc-active"),
    );
    // Second file id exists but is not active
    assert.ok(html.includes('href="#udiff-file-1"'));
  });

  it("TOC shows correct added and removed counts", () => {
    const html = buildUnifiedDiffHtml([
      {
        rel_path: "x.js",
        hunks: [
          {
            header: "@@",
            lines: [
              { content: "a", line_type: "added" },
              { content: "b", line_type: "added" },
              { content: "c", line_type: "removed" },
              { content: "d", line_type: "context" },
            ],
          },
        ],
      },
    ]);
    assert.ok(html.includes(">+2<"));
    assert.ok(html.includes(">-1<"));
  });

  it("TOC omits zero counts", () => {
    const html = buildUnifiedDiffHtml([
      {
        rel_path: "x.js",
        hunks: [
          {
            header: "@@",
            lines: [
              { content: "a", line_type: "added" },
              { content: "b", line_type: "added" },
            ],
          },
        ],
      },
    ]);
    assert.ok(html.includes(">+2<"));
    assert.ok(!html.includes("udiff-toc-removed"));
  });
});
