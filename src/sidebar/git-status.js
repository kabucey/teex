export async function fetchGitStatus(invoke, rootPath) {
  if (!rootPath) return {};
  try {
    return await invoke("git_status", { root: rootPath });
  } catch {
    return {};
  }
}

export function propagateFolderStatus(gitStatusMap) {
  if (!gitStatusMap || typeof gitStatusMap !== "object") return {};

  const result = { ...gitStatusMap };

  for (const relPath of Object.keys(gitStatusMap)) {
    const parts = relPath.split("/");
    for (let i = 1; i < parts.length; i += 1) {
      const folderPath = parts.slice(0, i).join("/");
      if (!result[folderPath]) {
        result[folderPath] = "M";
      }
    }
  }

  return result;
}

export function didGitStatusChange(prev, next) {
  if (prev === next) return false;
  if (!prev || !next) return true;

  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);

  if (prevKeys.length !== nextKeys.length) return true;

  for (const key of prevKeys) {
    if (prev[key] !== next[key]) return true;
  }

  return false;
}

const STATUS_CSS_CLASS = {
  M: "git-modified",
  A: "git-added",
  D: "git-deleted",
  R: "git-renamed",
  "?": "git-untracked",
};

export function gitStatusClass(status) {
  return STATUS_CSS_CLASS[status] || "";
}
