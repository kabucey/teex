import { shouldShowTabBar } from "../ui/behavior.js";
import { baseName } from "../app-utils.js";
import {
  clearActiveFileInState,
  flushStateToActiveTabInState,
  hasTabSession,
  normalizeTransferTab,
  snapshotActiveFileAsTransferTab,
  syncActiveTabToStateFromTabs,
} from "./session.js";

let nextDragId = 1;

export function createCrossWindowDragController({
  state,
  pendingOutgoingTabTransfers,
  invoke,
  el,
  render,
  setStatus,
  updateMenuState,
  markSidebarTreeDirty,
}) {
  let dragId = null;
  let fromIndex = -1;
  let targetLabel = null;
  let reporting = false;
  let previewVisible = false;

  function activate(index) {
    dragId = `cwdrag-${nextDragId++}`;
    fromIndex = index;
    targetLabel = null;
    reporting = false;
    previewVisible = false;
  }

  function isActive() {
    return dragId !== null;
  }

  function currentTargetLabel() {
    return targetLabel;
  }

  function getTabPreviewInfo(index) {
    flushStateToActiveTabInState(state);
    const tab = hasTabSession(state) ? state.openFiles[index] : null;
    const title = tab?.path ? baseName(tab.path) : (state.activePath ? baseName(state.activePath) : "Untitled");
    const content = tab?.content ?? state.content ?? "";
    return { title, content };
  }

  async function reportPosition(screenX, screenY) {
    if (!dragId || reporting) {
      return;
    }
    reporting = true;
    try {
      const physicalX = Math.round(screenX * window.devicePixelRatio);
      const physicalY = Math.round(screenY * window.devicePixelRatio);
      const result = await invoke("report_drag_position", {
        dragId,
        sourceLabel: state.windowLabel,
        physicalX,
        physicalY,
      });
      targetLabel = result ?? null;

      if (targetLabel) {
        if (previewVisible) {
          invoke("hide_tab_drag_preview").catch(() => {});
          previewVisible = false;
        }
      } else {
        const info = getTabPreviewInfo(fromIndex);
        invoke("show_tab_drag_preview", {
          physicalX,
          physicalY,
          title: info.title,
          content: info.content,
        }).catch(() => {});
        previewVisible = true;
      }
    } catch {
      targetLabel = null;
    } finally {
      reporting = false;
    }
  }

  async function cancel() {
    if (!dragId) {
      return;
    }
    const id = dragId;
    dragId = null;
    fromIndex = -1;
    targetLabel = null;
    reporting = false;
    previewVisible = false;
    try {
      await Promise.all([
        invoke("cancel_cross_window_drag_hover", { dragId: id }),
        invoke("hide_tab_drag_preview"),
      ]);
    } catch {
      // best-effort cleanup
    }
  }

  function snapshotSingleTab(index) {
    flushStateToActiveTabInState(state);
    if (hasTabSession(state)) {
      const tab = state.openFiles[index];
      if (!tab) {
        return null;
      }
      return normalizeTransferTab(tab);
    }
    return snapshotActiveFileAsTransferTab(state);
  }

  async function completeDrop() {
    if (!dragId || !targetLabel) {
      await cancel();
      return;
    }

    const tab = snapshotSingleTab(fromIndex);
    if (!tab) {
      await cancel();
      return;
    }

    const requestId = `cwdrag-transfer-${nextDragId++}`;
    pendingOutgoingTabTransfers.set(requestId, {
      kind: "single-drag",
      tabCount: 1,
      fromIndex,
    });

    const savedDragId = dragId;
    const savedTargetLabel = targetLabel;
    dragId = null;
    fromIndex = -1;
    targetLabel = null;
    reporting = false;
    previewVisible = false;

    try {
      await invoke("route_tab_transfer", {
        sourceLabel: state.windowLabel,
        targetLabel: savedTargetLabel,
        requestId,
        tabs: [tab],
      });
    } catch (error) {
      pendingOutgoingTabTransfers.delete(requestId);
      setStatus(String(error), true);
    }

    try {
      await invoke("cancel_cross_window_drag_hover", { dragId: savedDragId });
    } catch {
      // best-effort cleanup
    }
  }

  function removeTabFromSource(index) {
    if (!hasTabSession(state)) {
      clearActiveFileInState(state);
      if (state.mode !== "folder") {
        state.mode = "empty";
        markSidebarTreeDirty();
      }
      render();
      updateMenuState();
      return;
    }

    if (index < 0 || index >= state.openFiles.length) {
      return;
    }

    state.openFiles.splice(index, 1);
    if (state.openFiles.length === 0) {
      state.activeTabIndex = 0;
      clearActiveFileInState(state);
      if (state.mode !== "folder") {
        state.mode = "empty";
        markSidebarTreeDirty();
      }
    } else {
      if (state.activeTabIndex >= state.openFiles.length) {
        state.activeTabIndex = state.openFiles.length - 1;
      }
      syncActiveTabToStateFromTabs(state);
    }
    render();
    updateMenuState();
  }

  async function completeDropAsNewWindow(screenX, screenY) {
    if (!dragId) {
      return;
    }

    const tab = snapshotSingleTab(fromIndex);
    if (!tab || !tab.path) {
      await cancel();
      return;
    }

    const physicalX = Math.round(screenX * window.devicePixelRatio);
    const physicalY = Math.round(screenY * window.devicePixelRatio);

    const savedDragId = dragId;
    const savedFromIndex = fromIndex;
    dragId = null;
    fromIndex = -1;
    targetLabel = null;
    reporting = false;
    previewVisible = false;

    try {
      await invoke("create_window_from_drag", {
        physicalX,
        physicalY,
        path: tab.path,
      });
    } catch (error) {
      setStatus(String(error), true);
      try {
        await invoke("cancel_cross_window_drag_hover", { dragId: savedDragId });
      } catch {
        // best-effort
      }
      return;
    }

    removeTabFromSource(savedFromIndex);

    try {
      await invoke("cancel_cross_window_drag_hover", { dragId: savedDragId });
    } catch {
      // best-effort cleanup
    }
  }

  function showDropZone() {
    el.tabBar.classList.remove("hidden");
    el.tabBar.classList.add("tab-bar-drop-target");
  }

  function hideDropZone() {
    el.tabBar.classList.remove("tab-bar-drop-target");
    el.tabBar.classList.toggle("hidden", !shouldShowTabBar(state.openFiles.length));
  }

  function handleDragEnter() {
    showDropZone();
  }

  function handleDragLeave() {
    hideDropZone();
  }

  return {
    activate,
    isActive,
    currentTargetLabel,
    reportPosition,
    cancel,
    completeDrop,
    completeDropAsNewWindow,
    handleDragEnter,
    handleDragLeave,
  };
}
