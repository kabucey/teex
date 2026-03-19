import { escapeRegex } from "./regex-utils.js";

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildHighlightedHtml(content, query, activeIndex) {
  if (!query || !content) {
    return `${escapeHtml(content || "")}\n`;
  }

  const escaped = escapeRegex(query);
  const regex = new RegExp(escaped, "gi");
  const parts = [];
  let lastIndex = 0;
  let matchIndex = 0;

  for (
    let match = regex.exec(content);
    match !== null;
    match = regex.exec(content)
  ) {
    parts.push(escapeHtml(content.slice(lastIndex, match.index)));
    const cls = matchIndex === activeIndex ? ' class="find-active"' : "";
    parts.push(`<mark${cls}>${escapeHtml(match[0])}</mark>`);
    lastIndex = match.index + match[0].length;
    matchIndex++;
  }

  parts.push(escapeHtml(content.slice(lastIndex)));
  parts.push("\n");
  return parts.join("");
}
