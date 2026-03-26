import { buildUnifiedDiffHtml } from "./unified-renderer.js";

export function createUnifiedDiffController({ state, el, invoke }) {
  let debounceTimer = null;

  async function fetchAndRender() {
    if (state.activeKind !== "diff" || !state.rootPath) {
      return;
    }
    const rootPath = state.rootPath;
    try {
      const fileDiffs = await invoke("git_diff_all", { root: rootPath });
      if (state.activeKind === "diff" && state.rootPath === rootPath) {
        el.unifiedDiff.innerHTML = buildUnifiedDiffHtml(fileDiffs);
      }
    } catch (err) {
      console.error("Failed to fetch unified diff:", err);
      if (state.activeKind === "diff") {
        el.unifiedDiff.innerHTML = buildUnifiedDiffHtml([]);
      }
    }
  }

  function refreshNow() {
    clearTimeout(debounceTimer);
    return fetchAndRender();
  }

  function scheduleRefresh() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fetchAndRender, 300);
  }

  return { refreshNow, scheduleRefresh };
}
