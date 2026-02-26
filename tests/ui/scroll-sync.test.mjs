import test from "node:test";
import assert from "node:assert/strict";

import { createScrollSyncController } from "../../src/ui/scroll-sync.js";
import {
  computeEditorScrollTopFromSourceLine,
  computePreviewScrollTopFromSourceLine,
  getScrollRatio,
  scrollTopFromRatio,
} from "../../src/ui/scroll-math.js";
import {
  findPreviewBlockBySnippet,
  findSourceIndexBySnippet,
  findSourceLineBySnippet,
  normalizeSearchText,
  sourceIndexToLineNumber,
} from "../../src/ui/scroll-text-anchor.js";

function withFakeRaf(fn) {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  let queued = null;
  globalThis.requestAnimationFrame = (cb) => {
    queued = cb;
    return 1;
  };
  globalThis.cancelAnimationFrame = () => {};

  try {
    return fn({
      flushRaf() {
        queued?.();
        queued = null;
      },
    });
  } finally {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancel;
  }
}

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

test("ignores stale editor scroll event during non-tab file switch until restore runs", () => {
  withFakeRaf(({ flushRaf }) => {
    const state = {
      activePath: "/folder/file1.md",
      activeKind: "text",
      content: "one",
      markdownViewMode: "edit",
      activeEditorScrollTop: 200,
      activePreviewScrollTop: 0,
      activeMarkdownScrollAnchor: null,
      fileScrollMemory: new Map([
        ["/folder/file1.md", { editorScrollTop: 200, previewScrollTop: 0 }],
      ]),
      openFiles: [],
    };
    const el = {
      editor: { scrollTop: 200, scrollHeight: 1000, clientHeight: 300 },
      preview: { scrollTop: 0, scrollHeight: 1000, clientHeight: 300 },
    };
    const ctrl = createScrollSyncController({ state, el });

    ctrl.beforeApplyFilePayload();
    state.activePath = "/folder/file2.md";
    state.content = "two";
    state.activeEditorScrollTop = 0;
    state.activePreviewScrollTop = 0;
    ctrl.afterApplyFilePayload("/folder/file2.md");

    el.editor.scrollTop = 200;
    ctrl.onEditorScroll();
    assert.equal(state.fileScrollMemory.has("/folder/file2.md"), false);
    assert.equal(state.activeEditorScrollTop, 0);

    ctrl.afterRender();
    flushRaf();

    assert.equal(el.editor.scrollTop, 0);

    el.editor.scrollTop = 150;
    ctrl.onEditorScroll();
    assert.equal(state.fileScrollMemory.get("/folder/file2.md")?.editorScrollTop, 150);
  });
});

test("ignores stale editor scroll event during tab switch until restore runs", () => {
  withFakeRaf(({ flushRaf }) => {
    const state = {
      activePath: "/folder/file2.md",
      activeKind: "text",
      content: "two",
      markdownViewMode: "edit",
      activeEditorScrollTop: 0,
      activePreviewScrollTop: 0,
      activeMarkdownScrollAnchor: null,
      fileScrollMemory: new Map(),
      openFiles: [
        { path: "/folder/file1.md", scrollState: { editorScrollTop: 240, previewScrollTop: 0 } },
        { path: "/folder/file2.md", scrollState: { editorScrollTop: 0, previewScrollTop: 0 } },
      ],
    };
    const el = {
      editor: { scrollTop: 240, scrollHeight: 1000, clientHeight: 300 },
      preview: { scrollTop: 0, scrollHeight: 1000, clientHeight: 300 },
    };
    const ctrl = createScrollSyncController({ state, el });

    ctrl.afterRender();

    // Stale event from previous tab's DOM scroll position should not overwrite active tab scroll.
    ctrl.onEditorScroll();
    assert.equal(state.activeEditorScrollTop, 0);

    flushRaf();
    assert.equal(el.editor.scrollTop, 0);

    el.editor.scrollTop = 180;
    ctrl.onEditorScroll();
    assert.equal(state.activeEditorScrollTop, 180);
  });
});

test("folder to tabs promotion preserves first file scroll and repeated tab switching keeps independent scrolls", () => {
  withFakeRaf(({ flushRaf }) => {
    const state = {
      activePath: "/folder/file1.md",
      activeKind: "text",
      content: "one",
      markdownViewMode: "edit",
      activeEditorScrollTop: 220,
      activePreviewScrollTop: 0,
      activeMarkdownScrollAnchor: null,
      fileScrollMemory: new Map(),
      openFiles: [
        { path: "/folder/file1.md", scrollState: { editorScrollTop: 220, previewScrollTop: 0 } },
        { path: "/folder/file2.md", scrollState: { editorScrollTop: 0, previewScrollTop: 0 } },
      ],
    };
    const el = {
      editor: { scrollTop: 0, scrollHeight: 1000, clientHeight: 300 },
      preview: { scrollTop: 0, scrollHeight: 1000, clientHeight: 300 },
    };
    const ctrl = createScrollSyncController({ state, el });

    // Switch to file2 and ensure stale file1 scroll does not leak.
    state.activePath = "/folder/file2.md";
    state.activeEditorScrollTop = state.openFiles[1].scrollState.editorScrollTop;
    el.editor.scrollTop = 220; // stale DOM value from file1
    ctrl.afterRender();
    ctrl.onEditorScroll();
    assert.equal(state.activeEditorScrollTop, 0);
    flushRaf();
    assert.equal(el.editor.scrollTop, 0);

    // User scrolls file2.
    el.editor.scrollTop = 180;
    ctrl.onEditorScroll();
    state.activeEditorScrollTop = 180;
    state.openFiles[1].scrollState.editorScrollTop = 180;

    // Switch back to file1 and restore 220.
    state.activePath = "/folder/file1.md";
    state.activeEditorScrollTop = state.openFiles[0].scrollState.editorScrollTop;
    el.editor.scrollTop = 180; // stale DOM value from file2
    ctrl.afterRender();
    ctrl.onEditorScroll();
    assert.equal(state.activeEditorScrollTop, 220);
    flushRaf();
    assert.equal(el.editor.scrollTop, 220);

    // Switch again to file2 and restore 180 (not top, not file1 value).
    state.activePath = "/folder/file2.md";
    state.activeEditorScrollTop = state.openFiles[1].scrollState.editorScrollTop;
    el.editor.scrollTop = 220; // stale DOM value from file1
    ctrl.afterRender();
    ctrl.onEditorScroll();
    assert.equal(state.activeEditorScrollTop, 180);
    flushRaf();
    assert.equal(el.editor.scrollTop, 180);
  });
});
