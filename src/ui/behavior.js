export function isTextInputActive(element) {
  return element?.tagName?.toUpperCase() === "INPUT";
}

export function isUntitledTab({ activePath, openFiles, activeTabIndex }) {
  const files = openFiles || [];
  return (
    !activePath && files.length > 0 && files[activeTabIndex]?.path === null
  );
}

export function isUntitledMarkdownEditState(state) {
  return (
    state?.activeKind === "markdown" &&
    state?.markdownViewMode === "edit" &&
    isUntitledTab(state)
  );
}

export function hasActiveContent(state) {
  return Boolean(state.activePath) || isUntitledTab(state);
}

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

  if (
    !Array.isArray(entries) ||
    !entries.some((entry) => entry?.path === activePath)
  ) {
    return null;
  }

  return activePath;
}

export function shouldSidebarSingleClickOpenAsTab({ mode, openFilesCount }) {
  return mode === "folder" && Number(openFilesCount) >= 2;
}

export function shouldSidebarSingleClickIgnoreSamePath({
  mode,
  openFilesCount,
  activePath,
  nextPath,
}) {
  return (
    mode === "folder" &&
    Number(openFilesCount) < 2 &&
    Boolean(activePath) &&
    activePath === nextPath
  );
}

export function shouldCapturePreviousSingleFolderFile({
  mode,
  openFilesCount,
  activePath,
  nextPath,
}) {
  return (
    mode === "folder" &&
    Number(openFilesCount) === 0 &&
    Boolean(activePath) &&
    activePath !== nextPath
  );
}

export function shouldCollapseHiddenSingleTabForSidebarOpen({
  mode,
  openFilesCount,
}) {
  return mode === "folder" && Number(openFilesCount) === 1;
}

export function isActiveDiffTab({ openFiles, activeTabIndex }) {
  return openFiles?.[activeTabIndex]?.kind === "diff";
}

export function sidebarClickModifierAction(event) {
  const accel = event.metaKey || event.ctrlKey;
  if (!accel) {
    return null;
  }
  return event.shiftKey ? "new-window" : "new-tab";
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
