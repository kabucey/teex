export function createDiffController({
  state,
  invoke,
  codeEditorController,
  diffMapController,
}) {
  let debounceTimer = null;

  function clearDiff() {
    codeEditorController.clearDiffDecorations();
    diffMapController?.hide();
  }

  async function refresh() {
    const path = state.activePath;

    if (!path || !codeEditorController.isAttached()) {
      clearDiff();
      return;
    }

    try {
      const annotations = await invoke("git_diff", { path });
      // Only apply if the active file hasn't changed during the async call
      if (state.activePath === path) {
        codeEditorController.setDiffDecorations(annotations);
        diffMapController?.update(
          annotations,
          codeEditorController.getLineCount(),
        );
      }
    } catch {
      clearDiff();
    }
  }

  function scheduleRefresh() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(refresh, 300);
  }

  function clear() {
    clearTimeout(debounceTimer);
    clearDiff();
  }

  return { refresh, scheduleRefresh, clear };
}
