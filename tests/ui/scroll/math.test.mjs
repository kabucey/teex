import assert from "node:assert/strict";
import test from "node:test";
import {
  clamp,
  computePreviewScrollTopFromSourceLine,
  getEditorLineHeight,
  getMaxScrollTop,
  getPreviewAnchor,
  getPreviewBlocks,
} from "../../../src/ui/scroll/math.js";

test("clamp constrains value between min and max", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-1, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
  assert.equal(clamp(0, 0, 10), 0);
  assert.equal(clamp(10, 0, 10), 10);
});

test("clamp returns min for non-finite values", () => {
  // All non-finite values fall back to min (safe default)
  assert.equal(clamp(Infinity, 0, 10), 0);
  assert.equal(clamp(-Infinity, 0, 10), 0);
  assert.equal(clamp(NaN, 0, 10), 0);
});

test("getMaxScrollTop returns scrollHeight minus clientHeight", () => {
  const el = { scrollHeight: 500, clientHeight: 300 };
  assert.equal(getMaxScrollTop(el), 200);
});

test("getMaxScrollTop clamps to zero when content is shorter than container", () => {
  const el = { scrollHeight: 100, clientHeight: 300 };
  assert.equal(getMaxScrollTop(el), 0);
});

test("getMaxScrollTop returns zero for null element", () => {
  assert.equal(getMaxScrollTop(null), 0);
  assert.equal(getMaxScrollTop(undefined), 0);
});

test("getEditorLineHeight reads computed line-height from textarea", () => {
  const textarea = {
    style: {},
  };
  globalThis.window = {
    getComputedStyle: () => ({ fontSize: "16px", lineHeight: "24px" }),
  };
  assert.equal(getEditorLineHeight(textarea), 24);
  delete globalThis.window;
});

test("getEditorLineHeight falls back to fontSize * 1.6 when line-height is not numeric", () => {
  const textarea = { style: {} };
  globalThis.window = {
    getComputedStyle: () => ({ fontSize: "20px", lineHeight: "normal" }),
  };
  assert.equal(getEditorLineHeight(textarea), 32);
  delete globalThis.window;
});

test("getPreviewBlocks returns empty array for null element", () => {
  assert.deepEqual(getPreviewBlocks(null), []);
});

test("getPreviewBlocks extracts blocks with line mappings from DOM", () => {
  const node = {
    getAttribute: (attr) => {
      if (attr === "data-src-line-start") return "3";
      if (attr === "data-src-line-end") return "7";
      return null;
    },
    getBoundingClientRect: () => ({ top: 50 }),
    offsetHeight: 80,
    textContent: "hello",
  };
  const previewEl = {
    getBoundingClientRect: () => ({ top: 10 }),
    scrollTop: 100,
    querySelectorAll: () => [node],
  };

  const blocks = getPreviewBlocks(previewEl);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].startLine, 3);
  assert.equal(blocks[0].endLine, 7);
  assert.equal(blocks[0].top, 140); // 50 - 10 + 100
  assert.equal(blocks[0].height, 80);
  assert.equal(blocks[0].text, "hello");
});

test("getPreviewBlocks falls back to startLine when end attribute is missing", () => {
  const node = {
    getAttribute: (attr) => {
      if (attr === "data-src-line-start") return "5";
      return null;
    },
    getBoundingClientRect: () => ({ top: 0 }),
    offsetHeight: 40,
    textContent: "",
  };
  const previewEl = {
    getBoundingClientRect: () => ({ top: 0 }),
    scrollTop: 0,
    querySelectorAll: () => [node],
  };

  const blocks = getPreviewBlocks(previewEl);
  assert.equal(blocks[0].startLine, 5);
  assert.equal(blocks[0].endLine, 5);
});

test("getPreviewAnchor returns null sourceLine when there are no blocks", () => {
  const previewEl = {
    getBoundingClientRect: () => ({ top: 0 }),
    scrollTop: 0,
    scrollHeight: 200,
    clientHeight: 200,
    querySelectorAll: () => [],
  };

  const anchor = getPreviewAnchor(previewEl);
  assert.equal(anchor.sourceLine, null);
  assert.equal(anchor.lineFraction, 0);
  assert.equal(anchor.ratio, 0);
});

test("getPreviewAnchor returns source line at current scroll position", () => {
  const node = {
    getAttribute: (attr) => {
      if (attr === "data-src-line-start") return "1";
      if (attr === "data-src-line-end") return "10";
      return null;
    },
    getBoundingClientRect: () => ({ top: 0 }),
    offsetHeight: 200,
    textContent: "",
  };
  const previewEl = {
    getBoundingClientRect: () => ({ top: 0 }),
    scrollTop: 100,
    scrollHeight: 400,
    clientHeight: 200,
    querySelectorAll: () => [node],
  };

  const anchor = getPreviewAnchor(previewEl);
  assert.ok(anchor.sourceLine >= 1 && anchor.sourceLine <= 10);
  assert.equal(anchor.ratio, 0.5); // scrollTop 100 / maxScrollTop 200
});

test("computePreviewScrollTopFromSourceLine uses block position when blocks present", () => {
  const blocks = [{ startLine: 1, endLine: 10, top: 0, height: 100 }];
  const result = computePreviewScrollTopFromSourceLine({
    blocks,
    sourceLine: 5,
    lineFraction: 0,
    fallbackRatio: 0,
    maxScrollTop: 500,
  });
  // Line 5 in a 10-line block of height 100 → (5-1)/10 * 100 = 40
  assert.equal(result, 40);
});
