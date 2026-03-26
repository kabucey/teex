import { escapeAttr, escapeHtml } from "../html-utils.js";

const LINE_TYPE_CLASS = {
  added: "udiff-added",
  removed: "udiff-removed",
  context: "udiff-context",
};

function fileBaseName(relPath) {
  return relPath.split("/").at(-1) || relPath;
}

function countLines(file) {
  let added = 0;
  let removed = 0;
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.line_type === "added") added++;
      else if (line.line_type === "removed") removed++;
    }
  }
  return { added, removed };
}

/**
 * Build HTML for a unified diff view showing all modified files.
 * @param {Array<{rel_path: string, hunks: Array<{header: string, lines: Array<{content: string, line_type: string}>}>}>} fileDiffs
 * @returns {string} HTML string
 */
export function buildUnifiedDiffHtml(fileDiffs) {
  if (!fileDiffs || fileDiffs.length === 0) {
    return '<div class="udiff-empty-state">No changes to review.</div>';
  }

  let toc = '<nav class="udiff-toc" aria-label="Changed files">';
  let content = '<div class="udiff-content">';

  for (let i = 0; i < fileDiffs.length; i++) {
    const file = fileDiffs[i];
    const id = `udiff-file-${i}`;
    const name = fileBaseName(file.rel_path);
    const { added, removed } = countLines(file);

    toc += `<a class="udiff-toc-item${i === 0 ? " udiff-toc-active" : ""}" href="#${id}" data-target="${id}" title="${escapeAttr(file.rel_path)}">`;
    toc += `<span class="udiff-toc-name">${escapeHtml(name)}</span>`;
    toc += `<span class="udiff-toc-stats">`;
    if (added > 0) toc += `<span class="udiff-toc-added">+${added}</span>`;
    if (removed > 0)
      toc += `<span class="udiff-toc-removed">-${removed}</span>`;
    toc += `</span></a>`;

    content += `<div class="udiff-file" id="${id}" data-path="${escapeAttr(file.rel_path)}">`;
    content += `<div class="udiff-file-header">${escapeHtml(file.rel_path)}</div>`;

    for (const hunk of file.hunks) {
      content += `<div class="udiff-hunk">`;
      content += `<div class="udiff-hunk-header">${escapeHtml(hunk.header)}</div>`;

      for (const line of hunk.lines) {
        const cls = LINE_TYPE_CLASS[line.line_type] || "udiff-context";
        const prefix =
          line.line_type === "added"
            ? "+"
            : line.line_type === "removed"
              ? "-"
              : " ";
        content += `<div class="udiff-line ${cls}">${prefix}${escapeHtml(line.content)}</div>`;
      }

      content += `</div>`;
    }

    content += `</div>`;
  }

  toc += `</nav>`;
  content += `</div>`;

  return `<div class="udiff-layout">${toc}${content}</div>`;
}
