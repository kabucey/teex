export function createDiffController({
  state,
  invoke,
  codeEditorController,
  diffMapController,
}) {
  let debounceTimer = null;
  const cache = new Map();

  function clearDiff() {
    codeEditorController.clearDiffDecorations();
    diffMapController?.hide();
  }

  function applyAnnotations(annotations) {
    codeEditorController.setDiffDecorations(annotations);
    diffMapController?.update(annotations, codeEditorController.getLineCount());
  }

  async function refresh() {
    const path = state.activePath;

    if (!path || !codeEditorController.isAttached()) {
      clearDiff();
      return;
    }

    try {
      const annotations = await invoke("git_diff", { path });
      if (state.activePath === path) {
        cache.set(path, annotations);
        applyAnnotations(annotations);
      }
    } catch {
      clearDiff();
    }
  }

  function refreshNow() {
    clearTimeout(debounceTimer);
    const path = state.activePath;
    if (path && cache.has(path) && codeEditorController.isAttached()) {
      applyAnnotations(cache.get(path));
    }
    return refresh();
  }

  function scheduleRefresh() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(refresh, 300);
  }

  function invalidate(path) {
    cache.delete(path);
  }

  function clear() {
    clearTimeout(debounceTimer);
    clearDiff();
  }

  return { refresh, refreshNow, scheduleRefresh, invalidate, clear };
}
