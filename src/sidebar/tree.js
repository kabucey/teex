import { escapeAttr, escapeHtml } from "../ui/html-utils.js";

export function buildEntryTree(entries) {
  const root = { path: "", name: "", folders: new Map(), files: [] };

  for (const entry of entries) {
    const parts = entry.relPath.split("/").filter(Boolean);
    if (parts.length === 0) {
      continue;
    }

    let node = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const folderName = parts[i];
      const folderPath = node.path ? `${node.path}/${folderName}` : folderName;
      if (!node.folders.has(folderName)) {
        node.folders.set(folderName, {
          path: folderPath,
          name: folderName,
          folders: new Map(),
          files: [],
        });
      }
      node = node.folders.get(folderName);
    }

    node.files.push({
      name: parts[parts.length - 1],
      path: entry.path,
      relPath: entry.relPath,
    });
  }

  return root;
}

export function collectFolderPaths(entries) {
  const folders = new Set();

  for (const entry of entries) {
    const parts = entry.relPath.split("/").filter(Boolean);
    if (parts.length <= 1) {
      continue;
    }

    for (let i = 0; i < parts.length - 1; i += 1) {
      folders.add(parts.slice(0, i + 1).join("/"));
    }
  }

  return folders;
}

export function renderTreeHtml(node, depth, collapsedFolders) {
  const folders = [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name));
  node.files.sort((a, b) => a.name.localeCompare(b.name));

  let html = "";

  for (const folder of folders) {
    const isCollapsed = collapsedFolders.has(folder.path);
    const expanded = !isCollapsed;
    html += `<button class="folder-toggle" type="button" aria-expanded="${expanded}" style="--indent:${depth};" data-folder-path="${escapeAttr(folder.path)}"><span class="disclosure" aria-hidden="true"></span><span class="folder-icon" aria-hidden="true"></span><span class="folder-label">${escapeHtml(folder.name)}</span></button>`;
    if (!isCollapsed) {
      html += renderTreeHtml(folder, depth + 1, collapsedFolders);
    }
  }

  for (const file of node.files) {
    html += `<button class="project-item" style="--indent:${depth};" data-path="${escapeAttr(file.path)}" title="${escapeAttr(file.relPath)}">${escapeHtml(file.name)}</button>`;
  }

  return html;
}
