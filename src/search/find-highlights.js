import { escapeRegex } from "./regex-utils.js";

const TEXT_NODE = 3;

export function findTextNodeMatches(textNodes, query) {
  if (!query) {
    return [];
  }

  const escaped = escapeRegex(query);
  const regex = new RegExp(escaped, "gi");
  const matches = [];

  for (const node of textNodes) {
    if (node.nodeType !== TEXT_NODE) {
      continue;
    }
    const text = node.textContent;
    regex.lastIndex = 0;
    for (
      let match = regex.exec(text);
      match !== null;
      match = regex.exec(text)
    ) {
      matches.push({
        node,
        startOffset: match.index,
        endOffset: match.index + match[0].length,
      });
    }
  }

  return matches;
}

function collectTextNodes(root) {
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    nodes.push(node);
    node = walker.nextNode();
  }
  return nodes;
}

export function highlightMatches(container, query, activeIndex) {
  if (!query) {
    return 0;
  }

  const textNodes = collectTextNodes(container);
  const matches = findTextNodeMatches(textNodes, query);

  if (matches.length === 0) {
    return 0;
  }

  for (let i = matches.length - 1; i >= 0; i--) {
    const { node, startOffset, endOffset } = matches[i];
    const range = document.createRange();
    range.setStart(node, startOffset);
    range.setEnd(node, endOffset);

    const mark = document.createElement("mark");
    if (i === activeIndex) {
      mark.classList.add("find-active");
    }
    range.surroundContents(mark);
  }

  return matches.length;
}

export function clearHighlights(container) {
  const marks = container.querySelectorAll("mark");
  for (const mark of marks) {
    const parent = mark.parentNode;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
  }
  container.normalize();
}

export function setActiveHighlight(container, activeIndex) {
  const marks = container.querySelectorAll("mark");
  for (const mark of marks) {
    mark.classList.remove("find-active");
  }
  if (marks[activeIndex]) {
    marks[activeIndex].classList.add("find-active");
    marks[activeIndex].scrollIntoView({ block: "center", behavior: "instant" });
  }
}

export function scrollToActiveMatch(container) {
  const active = container.querySelector("mark.find-active");
  if (active) {
    active.scrollIntoView({ block: "center", behavior: "instant" });
  }
}
