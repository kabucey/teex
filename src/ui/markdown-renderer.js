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

function listItemParts(line) {
  const match = line.match(/^([ \t]*)([-*+]|\d+\.)\s+(.*)$/);
  if (!match) {
    return null;
  }

  const indent = match[1].replaceAll("\t", "    ").length;
  const marker = match[2];
  const rawText = match[3];
  const isOrdered = /\d+\./.test(marker);
  return { indent, isOrdered, rawText };
}

function renderListItemContent(rawText, srcLine) {
  const task = rawText.match(/^\[( |x|X)\]\s+(.*)$/);
  if (task) {
    const checked = task[1].toLowerCase() === "x";
    return `<input type="checkbox" data-src-line="${srcLine}" ${checked ? "checked" : ""} /> ${renderInline(task[2])}`;
  }
  return renderInline(rawText);
}

function parseList(lines, startIndex, baseIndent) {
  const first = listItemParts(lines[startIndex]);
  if (!first || first.indent !== baseIndent) {
    return null;
  }

  const tag = first.isOrdered ? "ol" : "ul";
  const items = [];
  let i = startIndex;

  while (i < lines.length) {
    const parts = listItemParts(lines[i]);
    if (!parts) {
      break;
    }
    if (parts.indent < baseIndent) {
      break;
    }
    if (parts.indent > baseIndent) {
      if (items.length === 0) {
        break;
      }
      const nested = parseList(lines, i, parts.indent);
      if (!nested) {
        break;
      }
      items[items.length - 1].nested += nested.html;
      i = nested.endIndex;
      continue;
    }
    if (parts.isOrdered !== (tag === "ol")) {
      break;
    }

    const srcLine = i + 1;
    items.push({
      content: renderListItemContent(parts.rawText, srcLine),
      nested: "",
    });
    i += 1;
  }

  const htmlItems = items.map((item) => `<li>${item.content}${item.nested}</li>`);

  return {
    html: `<${tag}>${htmlItems.join("")}</${tag}>`,
    endIndex: i,
  };
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

    const listStart = listItemParts(line);
    if (listStart) {
      const parsedList = parseList(lines, i, listStart.indent);
      if (parsedList) {
        i = parsedList.endIndex;
        blocks.push(withSourceRange(parsedList.html, blockStartLine, i));
        continue;
      }
    }

    if (/^\s*([-*+]\s+|\d+\.\s+)/.test(line)) {
      const tag = /^\s*\d+\.\s+/.test(line) ? "ol" : "ul";
      const item = line.replace(/^\s*([-*+]\s+|\d+\.\s+)/, "");
      blocks.push(withSourceRange(`<${tag}><li>${renderInline(item)}</li></${tag}>`, blockStartLine, blockStartLine));
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
