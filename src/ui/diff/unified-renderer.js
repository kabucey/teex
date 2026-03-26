import { escapeHtml } from "../html-utils.js";

const LINE_TYPE_CLASS = {
  added: "udiff-added",
  removed: "udiff-removed",
  context: "udiff-context",
};

/**
 * Build HTML for a unified diff view showing all modified files.
 * @param {Array<{rel_path: string, hunks: Array<{header: string, lines: Array<{content: string, line_type: string}>}>}>} fileDiffs
 * @returns {string} HTML string
 */
export function buildUnifiedDiffHtml(fileDiffs) {
  if (!fileDiffs || fileDiffs.length === 0) {
    return '<div class="udiff-empty-state">No changes to review</div>';
  }

  let html = "";

  for (const file of fileDiffs) {
    html += `<div class="udiff-file" data-path="${escapeHtml(file.rel_path)}">`;
    html += `<div class="udiff-file-header">${escapeHtml(file.rel_path)}</div>`;

    for (const hunk of file.hunks) {
      html += `<div class="udiff-hunk">`;
      html += `<div class="udiff-hunk-header">${escapeHtml(hunk.header)}</div>`;

      for (const line of hunk.lines) {
        const cls = LINE_TYPE_CLASS[line.line_type] || "udiff-context";
        const prefix =
          line.line_type === "added"
            ? "+"
            : line.line_type === "removed"
              ? "-"
              : " ";
        html += `<div class="udiff-line ${cls}">${prefix}${escapeHtml(line.content)}</div>`;
      }

      html += `</div>`;
    }

    html += `</div>`;
  }

  return html;
}
