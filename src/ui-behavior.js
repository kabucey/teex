export function getSingleFileUiOpenMode(stateMode) {
  if (stateMode === "folder") {
    return "folderTabs";
  }

  if (stateMode === "file" || stateMode === "files") {
    return "tabs";
  }

  return "single";
}

export function getSidebarSelectedPath({ mode, activePath, entries }) {
  if (mode !== "folder" || !activePath) {
    return null;
  }

  if (!Array.isArray(entries) || !entries.some((entry) => entry?.path === activePath)) {
    return null;
  }

  return activePath;
}

export function shouldSidebarSingleClickOpenAsTab({ mode, openFilesCount }) {
  return mode === "folder" && Number(openFilesCount) >= 2;
}

export function shouldSidebarSingleClickIgnoreSamePath({ mode, openFilesCount, activePath, nextPath }) {
  return (
    mode === "folder" &&
    Number(openFilesCount) < 2 &&
    Boolean(activePath) &&
    activePath === nextPath
  );
}

export function shouldCapturePreviousSingleFolderFile({ mode, openFilesCount, activePath, nextPath }) {
  return (
    mode === "folder" &&
    Number(openFilesCount) === 0 &&
    Boolean(activePath) &&
    activePath !== nextPath
  );
}

export function shouldCollapseHiddenSingleTabForSidebarOpen({ mode, openFilesCount }) {
  return mode === "folder" && Number(openFilesCount) === 1;
}

export function shouldSuppressDropOverlayForSelfHover({
  paths,
  activePath,
  rootPath,
}) {
  if (!Array.isArray(paths) || paths.length !== 1) {
    return false;
  }

  const [draggedPath] = paths;
  if (typeof draggedPath !== "string" || !draggedPath) {
    return false;
  }

  return draggedPath === activePath || draggedPath === rootPath;
}
