export function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function getMaxScrollTop(element) {
  if (!element) {
    return 0;
  }
  return Math.max(0, element.scrollHeight - element.clientHeight);
}

export function getScrollRatio(scrollTop, maxScrollTop) {
  if (!Number.isFinite(maxScrollTop) || maxScrollTop <= 0) {
    return 0;
  }
  return clamp(scrollTop / maxScrollTop, 0, 1);
}

export function scrollTopFromRatio(ratio, maxScrollTop) {
  if (!Number.isFinite(maxScrollTop) || maxScrollTop <= 0) {
    return 0;
  }
  return clamp(ratio, 0, 1) * maxScrollTop;
}

export function getEditorLineHeight(textarea) {
  const computed = window.getComputedStyle(textarea);
  const size = Number.parseFloat(computed.fontSize) || 16;
  const lineHeight = Number.parseFloat(computed.lineHeight);
  if (Number.isFinite(lineHeight)) {
    return lineHeight;
  }
  return size * 1.6;
}

function parseLineAttr(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getPreviewBlocks(previewEl) {
  if (!previewEl) {
    return [];
  }

  const blocks = [];
  previewEl.querySelectorAll("[data-src-line-start]").forEach((node) => {
    const startLine = parseLineAttr(node.getAttribute("data-src-line-start"), 1);
    const endLine = Math.max(startLine, parseLineAttr(node.getAttribute("data-src-line-end"), startLine));
    const top = node.offsetTop;
    const height = Math.max(1, node.offsetHeight);
    blocks.push({ node, startLine, endLine, top, height, text: node.textContent || "" });
  });

  blocks.sort((a, b) => a.top - b.top);
  return blocks;
}

function findBlockForSourceLine(blocks, sourceLine) {
  if (blocks.length === 0) {
    return null;
  }

  let candidate = blocks[0];
  for (const block of blocks) {
    if (sourceLine < block.startLine) {
      break;
    }
    candidate = block;
    if (sourceLine <= block.endLine) {
      return block;
    }
  }
  return candidate;
}

export function computePreviewScrollTopFromSourceLine({
  blocks,
  sourceLine,
  lineFraction = 0,
  fallbackRatio = 0,
  maxScrollTop = 0,
}) {
  if (!Array.isArray(blocks) || blocks.length === 0 || !Number.isFinite(sourceLine)) {
    return scrollTopFromRatio(fallbackRatio, maxScrollTop);
  }

  const block = findBlockForSourceLine(blocks, sourceLine);
  if (!block) {
    return scrollTopFromRatio(fallbackRatio, maxScrollTop);
  }

  const span = Math.max(1, block.endLine - block.startLine + 1);
  const relativeLines = clamp(((sourceLine - block.startLine) + lineFraction) / span, 0, 1);
  const raw = block.top + (relativeLines * block.height);
  return clamp(raw, 0, maxScrollTop);
}

export function computeEditorScrollTopFromSourceLine({
  sourceLine,
  lineFraction = 0,
  lineHeight,
  fallbackRatio = 0,
  maxScrollTop = 0,
}) {
  if (!Number.isFinite(sourceLine) || !Number.isFinite(lineHeight) || lineHeight <= 0) {
    return scrollTopFromRatio(fallbackRatio, maxScrollTop);
  }
  const lineIndex = Math.max(0, sourceLine - 1);
  const raw = (lineIndex + clamp(lineFraction, 0, 1)) * lineHeight;
  return clamp(raw, 0, maxScrollTop);
}

export function getPreviewAnchor(previewEl) {
  const blocks = getPreviewBlocks(previewEl);
  const maxScrollTop = getMaxScrollTop(previewEl);
  const ratio = getScrollRatio(previewEl.scrollTop, maxScrollTop);
  if (blocks.length === 0) {
    return { sourceLine: null, lineFraction: 0, ratio };
  }

  const scrollTop = previewEl.scrollTop;
  let block = blocks[0];
  for (const item of blocks) {
    if (item.top > scrollTop) {
      break;
    }
    block = item;
  }

  const offsetInBlock = clamp(scrollTop - block.top, 0, block.height);
  const blockFraction = block.height > 0 ? offsetInBlock / block.height : 0;
  const lineSpan = Math.max(1, block.endLine - block.startLine + 1);
  const sourceLine = block.startLine + Math.floor(blockFraction * lineSpan);
  const lineFraction = (blockFraction * lineSpan) % 1;
  return { sourceLine, lineFraction, ratio };
}
