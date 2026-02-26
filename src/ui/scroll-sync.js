import {
  clamp,
  computeEditorScrollTopFromSourceLine,
  computePreviewScrollTopFromSourceLine,
  getEditorLineHeight,
  getMaxScrollTop,
  getPreviewAnchor,
  getPreviewBlocks,
  getScrollRatio,
  scrollTopFromRatio,
} from "./scroll-math.js";
import {
  findPreviewBlockBySnippet,
  findSourceIndexBySnippet,
  findSourceLineBySnippet,
  getEditorTopTextSnippet,
  getPreviewTopTextSnippet,
  normalizeSearchText,
  sourceIndexToLineNumber,
} from "./scroll-text-anchor.js";

function isNonTabFileMemoryMode(state) {
  return !Array.isArray(state.openFiles) || state.openFiles.length === 0;
}

export function createScrollSyncController({ state, el }) {
  let pendingToggleAnchor = null;
  let restoreFrame = 0;
  let suppressNextNonTabRemember = false;
  const scrollCaptureGate = {
    blocked: false,
    reason: null,
  };

  function blockScrollCapture(reason) {
    scrollCaptureGate.blocked = true;
    scrollCaptureGate.reason = reason;
  }

  function unblockScrollCapture(reason = null) {
    if (!scrollCaptureGate.blocked) {
      return;
    }
    if (reason && scrollCaptureGate.reason && scrollCaptureGate.reason !== reason) {
      return;
    }
    scrollCaptureGate.blocked = false;
    scrollCaptureGate.reason = null;
  }

  function setEditorScrollTop(value) {
    state.activeEditorScrollTop = Math.max(0, Number.isFinite(value) ? value : 0);
  }

  function setPreviewScrollTop(value) {
    state.activePreviewScrollTop = Math.max(0, Number.isFinite(value) ? value : 0);
  }

  function rememberActiveFileScroll() {
    if (!state.activePath || !isNonTabFileMemoryMode(state)) {
      return;
    }
    state.fileScrollMemory.set(state.activePath, {
      editorScrollTop: state.activeEditorScrollTop || 0,
      previewScrollTop: state.activePreviewScrollTop || 0,
    });
  }

  function loadFileScroll(path) {
    const entry = path ? state.fileScrollMemory.get(path) : null;
    state.activeEditorScrollTop = Number.isFinite(entry?.editorScrollTop) ? entry.editorScrollTop : 0;
    state.activePreviewScrollTop = Number.isFinite(entry?.previewScrollTop) ? entry.previewScrollTop : 0;
    state.activeMarkdownScrollAnchor = null;
  }

  function clearFileScrollMemory() {
    state.fileScrollMemory.clear();
  }

  function beforeContextReplace() {
    suppressNextNonTabRemember = true;
    blockScrollCapture("context-switch");
    clearFileScrollMemory();
  }

  function beforeApplyFilePayload() {
    blockScrollCapture("file-payload-switch");
    if (!hasTabSessionLike() && !suppressNextNonTabRemember) {
      rememberActiveFileScroll();
    }
  }

  function afterApplyFilePayload(path) {
    suppressNextNonTabRemember = false;
    if (!hasTabSessionLike()) {
      loadFileScroll(path);
    }
  }

  function afterContextCleared() {
    suppressNextNonTabRemember = false;
    unblockScrollCapture();
    clearFileScrollMemory();
  }

  function hasTabSessionLike() {
    return Array.isArray(state.openFiles) && state.openFiles.length > 0;
  }

  function onEditorScroll() {
    if (!el.editor) {
      return;
    }
    if (scrollCaptureGate.blocked) {
      return;
    }
    setEditorScrollTop(el.editor.scrollTop);
    rememberActiveFileScroll();
  }

  function onPreviewScroll() {
    if (!el.preview) {
      return;
    }
    if (scrollCaptureGate.blocked) {
      return;
    }
    setPreviewScrollTop(el.preview.scrollTop);
    rememberActiveFileScroll();
  }

  function captureMarkdownToggleAnchor() {
    if (state.activeKind !== "markdown" || !state.activePath) {
      pendingToggleAnchor = null;
      return;
    }

    if (state.markdownViewMode === "preview") {
      pendingToggleAnchor = {
        fromMode: "preview",
        ...getPreviewAnchor(el.preview),
        textSnippet: getPreviewTopTextSnippet(el.preview),
        sourceScrollTop: el.preview?.scrollTop || 0,
      };
      return;
    }

    const maxScrollTop = getMaxScrollTop(el.editor);
    const lineHeight = getEditorLineHeight(el.editor);
    const editorScrollTop = el.editor?.scrollTop || 0;
    const lineValue = lineHeight > 0 ? (editorScrollTop / lineHeight) : 0;
    pendingToggleAnchor = {
      fromMode: "edit",
      sourceLine: Math.floor(lineValue) + 1,
      lineFraction: lineValue % 1,
      ratio: getScrollRatio(editorScrollTop, maxScrollTop),
      textSnippet: getEditorTopTextSnippet({
        content: state.content,
        scrollTop: editorScrollTop,
        lineHeight,
      }),
      sourceScrollTop: editorScrollTop,
    };
  }

  function alignPreviewToEditAnchor(anchor) {
    const blocks = getPreviewBlocks(el.preview);
    const maxScrollTop = getMaxScrollTop(el.preview);
    const textMatchedBlock = findPreviewBlockBySnippet(blocks, anchor.textSnippet);
    if (textMatchedBlock) {
      const target = clamp(textMatchedBlock.top, 0, maxScrollTop);
      setPreviewScrollTop(target);
      return {
        phase: "apply",
        toMode: "preview",
        method: "snippet-preview-block",
        textSnippet: anchor.textSnippet,
        found: true,
        matchedText: textMatchedBlock.text || textMatchedBlock.node?.textContent || "",
        matchedTop: textMatchedBlock.top,
        targetScrollTop: target,
        fallbackRatio: anchor.ratio,
      };
    }

    const target = computePreviewScrollTopFromSourceLine({
      blocks,
      sourceLine: anchor.sourceLine,
      lineFraction: anchor.lineFraction,
      fallbackRatio: anchor.ratio,
      maxScrollTop,
    });
    setPreviewScrollTop(target);
    return {
      phase: "apply",
      toMode: "preview",
      method: "source-line-fallback",
      textSnippet: anchor.textSnippet,
      found: false,
      sourceLine: anchor.sourceLine,
      lineFraction: anchor.lineFraction,
      targetScrollTop: target,
      fallbackRatio: anchor.ratio,
    };
  }

  function alignEditToPreviewAnchor(anchor) {
    const maxScrollTop = getMaxScrollTop(el.editor);
    const lineHeight = getEditorLineHeight(el.editor);
    const rawMatchedIndex = findSourceIndexBySnippet(state.content, anchor.textSnippet);
    const rawMatchedLine = sourceIndexToLineNumber(state.content, rawMatchedIndex);
    if (Number.isFinite(rawMatchedLine)) {
      const target = computeEditorScrollTopFromSourceLine({
        sourceLine: rawMatchedLine,
        lineFraction: 0,
        lineHeight,
        fallbackRatio: anchor.ratio,
        maxScrollTop,
      });
      setEditorScrollTop(target);
      return {
        phase: "apply",
        toMode: "edit",
        method: "exact-text-source-search",
        textSnippet: anchor.textSnippet,
        found: true,
        matchedSourceIndex: rawMatchedIndex,
        matchedSourceLine: rawMatchedLine,
        targetScrollTop: target,
        lineHeight,
        fallbackRatio: anchor.ratio,
      };
    }

    const matchedSourceLine = findSourceLineBySnippet(state.content, anchor.textSnippet);
    if (Number.isFinite(matchedSourceLine)) {
      const target = computeEditorScrollTopFromSourceLine({
        sourceLine: matchedSourceLine,
        lineFraction: 0,
        lineHeight,
        fallbackRatio: anchor.ratio,
        maxScrollTop,
      });
      setEditorScrollTop(target);
      return {
        phase: "apply",
        toMode: "edit",
        method: "snippet-source-search",
        textSnippet: anchor.textSnippet,
        found: true,
        matchedSourceLine,
        targetScrollTop: target,
        lineHeight,
        fallbackRatio: anchor.ratio,
      };
    }

    let target = computeEditorScrollTopFromSourceLine({
      sourceLine: anchor.sourceLine,
      lineFraction: anchor.lineFraction,
      lineHeight,
      fallbackRatio: anchor.ratio,
      maxScrollTop,
    });
    if (anchor.fromMode !== "preview") {
      target = scrollTopFromRatio(anchor.ratio, maxScrollTop);
    }
    setEditorScrollTop(target);
    return {
      phase: "apply",
      toMode: "edit",
      method: anchor.fromMode === "preview" ? "source-line-fallback" : "ratio-fallback",
      textSnippet: anchor.textSnippet,
      found: false,
      sourceLine: anchor.sourceLine,
      lineFraction: anchor.lineFraction,
      targetScrollTop: target,
      lineHeight,
      fallbackRatio: anchor.ratio,
    };
  }

  function applyPendingToggleAlignment() {
    if (!pendingToggleAnchor || state.activeKind !== "markdown") {
      return null;
    }

    const anchor = pendingToggleAnchor;
    pendingToggleAnchor = null;

    if (state.markdownViewMode === "preview") {
      return alignPreviewToEditAnchor(anchor);
    }
    return alignEditToPreviewAnchor(anchor);
  }

  function scheduleRestoreAfterRender() {
    if (!state.activePath) {
      return;
    }
    blockScrollCapture("render-restore");

    const apply = () => {
      if (state.activeKind === "markdown" && state.markdownViewMode === "preview" && el.preview) {
        el.preview.scrollTop = clamp(state.activePreviewScrollTop || 0, 0, getMaxScrollTop(el.preview));
        return;
      }

      if (el.editor) {
        el.editor.scrollTop = clamp(state.activeEditorScrollTop || 0, 0, getMaxScrollTop(el.editor));
      }
    };

    if (restoreFrame) {
      cancelAnimationFrame(restoreFrame);
    }
    restoreFrame = requestAnimationFrame(() => {
      restoreFrame = 0;
      applyPendingToggleAlignment();
      apply();
      unblockScrollCapture("render-restore");
    });
  }

  return {
    onEditorScroll,
    onPreviewScroll,
    rememberActiveFileScroll,
    loadFileScroll,
    clearFileScrollMemory,
    beforeContextReplace,
    beforeApplyFilePayload,
    afterApplyFilePayload,
    afterContextCleared,
    captureMarkdownToggleAnchor,
    beforeRenderRestore: () => blockScrollCapture("render-restore"),
    scheduleRestoreAfterRender,
    restoreVisiblePaneScroll: scheduleRestoreAfterRender,
    afterRender: scheduleRestoreAfterRender,
  };
}
