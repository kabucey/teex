import { getPreviewBlocks } from "./scroll-math.js";

export function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getNodeDocument(node) {
  if (!node) {
    return null;
  }
  if (typeof Node !== "undefined" && node.nodeType === Node.DOCUMENT_NODE) {
    return node;
  }
  return node.ownerDocument || null;
}

function getNextTextNode(root, current) {
  const doc = getNodeDocument(root);
  if (!doc || typeof NodeFilter === "undefined") {
    return null;
  }
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let foundCurrent = false;
  let node = walker.nextNode();
  while (node) {
    if (foundCurrent) {
      return node;
    }
    if (node === current) {
      foundCurrent = true;
    }
    node = walker.nextNode();
  }
  return null;
}

function collectTextFromTextPosition(root, startNode, startOffset, maxChars = 120) {
  if (!root || !startNode || typeof Node === "undefined" || startNode.nodeType !== Node.TEXT_NODE) {
    return "";
  }

  let remaining = maxChars;
  let node = startNode;
  let offset = Math.max(0, startOffset || 0);
  let text = "";

  while (node && remaining > 0) {
    const value = node.nodeValue || "";
    if (offset < value.length) {
      const chunk = value.slice(offset, offset + remaining);
      text += chunk;
      remaining -= chunk.length;
    }
    node = getNextTextNode(root, node);
    offset = 0;
    if (node && remaining > 0) {
      text += " ";
      remaining -= 1;
    }
  }

  return text;
}

function getCaretTextPositionFromPoint(containerEl, x, y) {
  if (!containerEl || typeof document === "undefined" || typeof Node === "undefined") {
    return null;
  }

  if (typeof document.caretPositionFromPoint === "function") {
    const pos = document.caretPositionFromPoint(x, y);
    if (pos?.offsetNode) {
      const node = pos.offsetNode.nodeType === Node.TEXT_NODE ? pos.offsetNode : pos.offsetNode.firstChild;
      if (node?.nodeType === Node.TEXT_NODE) {
        return { node, offset: pos.offset };
      }
    }
  }

  if (typeof document.caretRangeFromPoint === "function") {
    const range = document.caretRangeFromPoint(x, y);
    if (range?.startContainer) {
      const node = range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer
        : range.startContainer.firstChild;
      if (node?.nodeType === Node.TEXT_NODE) {
        return { node, offset: range.startOffset };
      }
    }
  }

  return null;
}

function getPreviewTopExactTextSnippet(previewEl) {
  if (!previewEl) {
    return "";
  }
  const rect = previewEl.getBoundingClientRect();
  const point = getCaretTextPositionFromPoint(previewEl, rect.left + 16, rect.top + 8);
  if (!point) {
    return "";
  }
  return collectTextFromTextPosition(previewEl, point.node, point.offset, 120);
}

export function getPreviewTopTextSnippet(previewEl) {
  const exact = getPreviewTopExactTextSnippet(previewEl);
  if (exact) {
    return exact.slice(0, 120);
  }

  const blocks = getPreviewBlocks(previewEl);
  if (blocks.length === 0) {
    return "";
  }
  const scrollTop = previewEl.scrollTop;
  let block = blocks[0];
  for (const item of blocks) {
    if (item.top > scrollTop) {
      break;
    }
    block = item;
  }
  return (block.text || block.node?.textContent || "").slice(0, 180);
}

export function getEditorTopTextSnippet({ content, scrollTop, lineHeight }) {
  const source = String(content || "");
  if (!source) {
    return "";
  }
  const lines = source.split("\n");
  const lineIndex = Math.max(0, Math.floor((scrollTop || 0) / Math.max(lineHeight || 1, 1)));
  const start = Math.max(0, lineIndex - 1);
  const snippet = normalizeSearchText(lines.slice(start, start + 5).join(" "));
  return snippet.slice(0, 180);
}

function indexToLineNumber(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === "\n") {
      line += 1;
    }
  }
  return line;
}

function distanceToTargetLine(line, nearLine) {
  if (!Number.isFinite(nearLine)) {
    return 0;
  }
  return Math.abs(line - nearLine);
}

export function findSourceIndexBySnippet(content, snippet, options = {}) {
  const source = String(content || "");
  const rawNeedle = String(snippet || "").trim();
  if (rawNeedle.length < 8) {
    return null;
  }

  const matches = [];
  let from = 0;
  while (from <= source.length) {
    const index = source.indexOf(rawNeedle, from);
    if (index === -1) {
      break;
    }
    const line = indexToLineNumber(source, index);
    matches.push({ index, line, distance: distanceToTargetLine(line, options.nearLine) });
    from = index + 1;
  }

  if (matches.length === 0) {
    return null;
  }

  matches.sort((a, b) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    return a.index - b.index;
  });
  return matches[0].index;
}

export function sourceIndexToLineNumber(content, index) {
  const source = String(content || "");
  if (!Number.isInteger(index) || index < 0) {
    return null;
  }
  return indexToLineNumber(source, index);
}

export function findSourceLineBySnippet(content, snippet, options = {}) {
  const source = String(content || "");
  const normalizedNeedle = normalizeSearchText(snippet);
  if (normalizedNeedle.length < 8) {
    return null;
  }

  const lines = source.split("\n");
  const matches = [];
  for (let i = 0; i < lines.length; i += 1) {
    const windowText = lines.slice(i, i + 5).join(" ");
    if (normalizeSearchText(windowText).includes(normalizedNeedle)) {
      const line = i + 1;
      matches.push({ line, distance: distanceToTargetLine(line, options.nearLine) });
    }
  }

  if (matches.length === 0) {
    return null;
  }

  matches.sort((a, b) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    return a.line - b.line;
  });
  return matches[0].line;
}

function lineDistanceToBlock(block, nearLine) {
  if (!Number.isFinite(nearLine)) {
    return 0;
  }
  const start = Number.isFinite(block.startLine) ? block.startLine : nearLine;
  const end = Number.isFinite(block.endLine) ? block.endLine : start;
  if (nearLine < start) {
    return start - nearLine;
  }
  if (nearLine > end) {
    return nearLine - end;
  }
  return 0;
}

export function findPreviewBlockBySnippet(blocks, snippet, options = {}) {
  const normalizedNeedle = normalizeSearchText(snippet);
  if (!Array.isArray(blocks) || blocks.length === 0 || normalizedNeedle.length < 8) {
    return null;
  }

  let best = null;
  for (const block of blocks) {
    const haystack = normalizeSearchText(block.text || block.node?.textContent || "");
    const index = haystack.indexOf(normalizedNeedle);
    if (index === -1) {
      continue;
    }
    const lineDistance = lineDistanceToBlock(block, options.nearLine);
    const candidate = { block, index, lineDistance };
    if (!best) {
      best = candidate;
      continue;
    }

    if (candidate.lineDistance < best.lineDistance) {
      best = candidate;
      continue;
    }
    if (candidate.lineDistance > best.lineDistance) {
      continue;
    }
    if (candidate.index < best.index) {
      best = candidate;
      continue;
    }
    if (candidate.index === best.index && (candidate.block.top || 0) < (best.block.top || 0)) {
      best = candidate;
    }
  }
  return best?.block || null;
}
