import test from "node:test";
import assert from "node:assert/strict";

import {
  computeEditorScrollTopFromSourceLine,
  computePreviewScrollTopFromSourceLine,
  findPreviewBlockBySnippet,
  findSourceIndexBySnippet,
  findSourceLineBySnippet,
  getScrollRatio,
  normalizeSearchText,
  sourceIndexToLineNumber,
  scrollTopFromRatio,
} from "../../src/ui/scroll-sync.js";

test("scroll ratio helpers clamp and round-trip", () => {
  assert.equal(getScrollRatio(50, 200), 0.25);
  assert.equal(getScrollRatio(50, 0), 0);
  assert.equal(scrollTopFromRatio(0.25, 200), 50);
  assert.equal(scrollTopFromRatio(2, 100), 100);
});

test("maps source line to preview block with interpolation", () => {
  const blocks = [
    { startLine: 1, endLine: 5, top: 0, height: 100 },
    { startLine: 6, endLine: 15, top: 120, height: 300 },
  ];

  const top = computePreviewScrollTopFromSourceLine({
    blocks,
    sourceLine: 10,
    lineFraction: 0.5,
    fallbackRatio: 0,
    maxScrollTop: 500,
  });

  assert.equal(top, 255);
});

test("preview mapping falls back to ratio when blocks are missing", () => {
  const top = computePreviewScrollTopFromSourceLine({
    blocks: [],
    sourceLine: 20,
    lineFraction: 0,
    fallbackRatio: 0.4,
    maxScrollTop: 250,
  });
  assert.equal(top, 100);
});

test("maps source line to editor scroll and clamps", () => {
  assert.equal(computeEditorScrollTopFromSourceLine({
    sourceLine: 5,
    lineFraction: 0.5,
    lineHeight: 20,
    fallbackRatio: 0,
    maxScrollTop: 1000,
  }), 90);

  assert.equal(computeEditorScrollTopFromSourceLine({
    sourceLine: 200,
    lineFraction: 0,
    lineHeight: 20,
    fallbackRatio: 0,
    maxScrollTop: 100,
  }), 100);
});

test("normalizes lightweight search text and finds source line by snippet", () => {
  assert.equal(normalizeSearchText("  Hello\n   World "), "hello world");

  const sourceLine = findSourceLineBySnippet(
    "# Title\n\nThis is a paragraph.\nAnother line here.",
    "another line here",
  );
  assert.equal(sourceLine, 2);
});

test("finds preview block by normalized text snippet", () => {
  const block = findPreviewBlockBySnippet([
    { top: 0, text: "Intro text" },
    { top: 120, text: "This is a paragraph with More spacing" },
  ], "paragraph   with more");

  assert.equal(block?.top, 120);
});

test("finds exact source snippet index and converts to line number", () => {
  const content = "# Title\n\nalpha beta gamma\nnext line";
  const index = findSourceIndexBySnippet(content, "alpha beta");
  assert.equal(index, content.indexOf("alpha beta"));
  assert.equal(sourceIndexToLineNumber(content, index), 3);
  assert.equal(findSourceIndexBySnippet(content, "missing snippet"), null);
});
