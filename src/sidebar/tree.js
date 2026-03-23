import { escapeAttr, escapeHtml } from "../ui/html-utils.js";
import { gitStatusClass } from "./git-status.js";

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

export function hasFoldersInEntries(entries) {
  return entries.some((e) => e.relPath.includes("/"));
}

export function isAllCollapsed(entries, collapsedFolders) {
  const allFolders = collectFolderPaths(entries);
  for (const folder of allFolders) {
    if (!collapsedFolders.has(folder)) return false;
  }
  return true;
}

export function collectSubfolderPaths(folderPath, entries) {
  const all = collectFolderPaths(entries);
  const result = new Set();
  for (const p of all) {
    if (p === folderPath || p.startsWith(`${folderPath}/`)) {
      result.add(p);
    }
  }
  return result;
}

export function buildCollapsedFoldersFromExpanded(entries, expandedFolders) {
  const allFolders = collectFolderPaths(entries);
  if (!(expandedFolders instanceof Set) || expandedFolders.size === 0) {
    return allFolders;
  }

  return new Set(
    [...allFolders].filter((folderPath) => !expandedFolders.has(folderPath)),
  );
}

export function parentFolderPaths(entries, filePath) {
  const result = new Set();
  const entry = entries.find((e) => e.path === filePath);
  if (!entry) {
    return result;
  }

  const parts = entry.relPath.split("/").filter(Boolean);
  for (let i = 0; i < parts.length - 1; i += 1) {
    result.add(parts.slice(0, i + 1).join("/"));
  }

  return result;
}

export function renderTreeHtml(
  node,
  depth,
  collapsedFolders,
  gitStatusMap = {},
) {
  const folders = [...node.folders.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  node.files.sort((a, b) => a.name.localeCompare(b.name));

  let html = "";

  for (const folder of folders) {
    const isCollapsed = collapsedFolders.has(folder.path);
    const expanded = !isCollapsed;
    const folderStatus = gitStatusMap[folder.path] || "";
    const folderGitClass = folderStatus
      ? ` ${gitStatusClass(folderStatus)}`
      : "";
    html += `<button class="folder-toggle${folderGitClass}" type="button" aria-expanded="${expanded}" style="--indent:${depth};" data-folder-path="${escapeAttr(folder.path)}"><span class="disclosure" aria-hidden="true"></span><span class="folder-icon" aria-hidden="true"></span><span class="folder-label">${escapeHtml(folder.name)}</span></button>`;
    if (!isCollapsed) {
      html += `<div class="folder-children" style="--indent:${depth};">`;
      html += renderTreeHtml(folder, depth + 1, collapsedFolders, gitStatusMap);
      html += `</div>`;
    }
  }

  for (const file of node.files) {
    const fileStatus = gitStatusMap[file.relPath] || "";
    const fileGitClass = fileStatus ? ` ${gitStatusClass(fileStatus)}` : "";
    const badge = fileStatus
      ? `<span class="git-badge">${escapeHtml(fileStatus)}</span>`
      : "";
    html += `<button class="project-item${fileGitClass}" style="--indent:${depth};" data-path="${escapeAttr(file.path)}"><span class="project-item-label">${escapeHtml(file.name)}</span>${badge}</button>`;
  }

  return html;
}
