function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function withSourceRange(html, startLine, endLine) {
  return html.replace(
    /^<([a-zA-Z0-9]+)/,
    `<$1 data-src-line-start="${startLine}" data-src-line-end="${endLine}"`,
  );
}

function isTableStart(lines, index) {
  if (index + 1 >= lines.length) {
    return false;
  }
  if (!lines[index].includes("|")) {
    return false;
  }
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1]);
}

function splitTableRow(row) {
  return row
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function startsSpecialBlock(lines, index) {
  const line = lines[index];
  return (
    /^```/.test(line) ||
    /^(#{1,6})\s+/.test(line) ||
    /^\s*([-*_])\1{2,}\s*$/.test(line) ||
    line.startsWith("> ") ||
    /^\s*([-*+]\s+|\d+\.\s+)/.test(line) ||
    isTableStart(lines, index)
  );
}

function renderInline(text) {
  let value = escapeHtml(text);
  value = value.replace(/`([^`]+)`/g, "<code>$1</code>");
  value = value.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  value = value.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  value = value.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
  return value;
}

export function renderMarkdown(markdown) {
  const source = markdown.replace(/\r\n/g, "\n");
  const lines = source.split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const blockStartLine = i + 1;

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = line.match(/^```([a-zA-Z0-9_-]*)\s*$/);
    if (fence) {
      const lang = fence[1] || "";
      const code = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(withSourceRange(
        `<pre><code class="language-${escapeAttr(lang)}">${escapeHtml(code.join("\n"))}</code></pre>`,
        blockStartLine,
        i,
      ));
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(withSourceRange(
        `<h${level}>${renderInline(heading[2])}</h${level}>`,
        blockStartLine,
        blockStartLine,
      ));
      i += 1;
      continue;
    }

    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(withSourceRange("<hr />", blockStartLine, blockStartLine));
      i += 1;
      continue;
    }

    if (line.startsWith("> ")) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quote.push(lines[i].slice(2));
        i += 1;
      }
      blocks.push(withSourceRange(
        `<blockquote>${quote.map((q) => `<p>${renderInline(q)}</p>`).join("")}</blockquote>`,
        blockStartLine,
        i,
      ));
      continue;
    }

    if (isTableStart(lines, i)) {
      const header = splitTableRow(lines[i]);
      const body = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|")) {
        body.push(splitTableRow(lines[i]));
        i += 1;
      }

      const thead = `<thead><tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead>`;
      const tbody = `<tbody>${body
        .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
        .join("")}</tbody>`;
      blocks.push(withSourceRange(`<table>${thead}${tbody}</table>`, blockStartLine, i));
      continue;
    }

    if (/^\s*([-*+]\s+|\d+\.\s+)/.test(line)) {
      const isOrdered = /^\s*\d+\.\s+/.test(line);
      const tag = isOrdered ? "ol" : "ul";
      const items = [];

      while (i < lines.length && /^\s*([-*+]\s+|\d+\.\s+)/.test(lines[i])) {
        let itemText = lines[i].replace(/^\s*([-*+]\s+|\d+\.\s+)/, "");
        const task = itemText.match(/^\[( |x|X)\]\s+(.*)$/);
        if (task) {
          const checked = task[1].toLowerCase() === "x";
          itemText = `<input type="checkbox" disabled ${checked ? "checked" : ""} /> ${renderInline(task[2])}`;
        } else {
          itemText = renderInline(itemText);
        }
        items.push(`<li>${itemText}</li>`);
        i += 1;
      }

      blocks.push(withSourceRange(`<${tag}>${items.join("")}</${tag}>`, blockStartLine, i));
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !startsSpecialBlock(lines, i)) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push(withSourceRange(`<p>${renderInline(paragraph.join(" "))}</p>`, blockStartLine, i));
  }

  return blocks.join("\n");
}
