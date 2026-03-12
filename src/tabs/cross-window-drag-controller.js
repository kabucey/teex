import { createCrossWindowDragSession } from "./cross-window-drag-session.js";
import { createCrossWindowDropZone } from "./cross-window-drop-zone.js";
import {
  clearActiveFileInState,
  flushStateToActiveTabInState,
  hasTabSession,
  normalizeTransferTab,
  snapshotActiveFileAsTransferTab,
  syncActiveTabToStateFromTabs,
} from "./session.js";

function buildPathModeTransferTab(dragSession) {
  return {
    path: dragSession.dragPath,
    content: dragSession.dragPreviewInfo?.content ?? "",
    kind: "text",
    writable: true,
    isDirty: false,
    markdownViewMode: "edit",
    scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
  };
}

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
  const dragSession = createCrossWindowDragSession();
  const dropZone = createCrossWindowDropZone({ state, el });

  function getTabPreviewInfo(index) {
    flushStateToActiveTabInState(state);
    const tab = hasTabSession(state) ? state.openFiles[index] : null;
    const previewPath = tab?.path ?? state.activePath ?? null;
    return {
      title: previewPath ? previewPath.split(/[\\/]/).pop() : "Untitled",
      content: tab?.content ?? state.content ?? "",
    };
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

  async function reportPosition(screenX, screenY) {
    if (!dragSession.dragId || dragSession.isReporting()) {
      return;
    }
    dragSession.setReporting(true);
    try {
      const physicalX = Math.round(screenX * window.devicePixelRatio);
      const physicalY = Math.round(screenY * window.devicePixelRatio);
      const info =
        dragSession.dragMode === "path"
          ? dragSession.dragPreviewInfo
          : getTabPreviewInfo(dragSession.fromIndex);
      const result = await invoke("report_drag_position", {
        dragId: dragSession.dragId,
        sourceLabel: state.windowLabel,
        physicalX,
        physicalY,
        tabName: info.title,
      });
      dragSession.setTargetLabel(result ?? null);

      if (dragSession.targetLabel) {
        if (dragSession.isPreviewVisible()) {
          invoke("hide_tab_drag_preview").catch(() => {});
          dragSession.setPreviewVisible(false);
        }
      } else {
        invoke("show_tab_drag_preview", {
          physicalX,
          physicalY,
          title: info.title,
          content: info.content,
        }).catch(() => {});
        dragSession.setPreviewVisible(true);
      }
    } catch {
      dragSession.clearTargetLabel();
    } finally {
      dragSession.setReporting(false);
    }
  }

  function clearPreview() {
    if (dragSession.isPreviewVisible()) {
      invoke("hide_tab_drag_preview").catch(() => {});
      dragSession.setPreviewVisible(false);
    }
    dragSession.clearTargetLabel();
  }

  async function cancel() {
    if (!dragSession.dragId) {
      return;
    }
    const dragId = dragSession.dragId;
    dragSession.reset();
    try {
      await Promise.all([
        invoke("cancel_cross_window_drag_hover", { dragId }),
        invoke("hide_tab_drag_preview"),
      ]);
    } catch {
      // best-effort cleanup
    }
  }

  async function completeDrop() {
    if (!dragSession.dragId || !dragSession.targetLabel) {
      await cancel();
      return;
    }

    const isPathMode = dragSession.dragMode === "path";
    const tab = isPathMode
      ? buildPathModeTransferTab(dragSession)
      : snapshotSingleTab(dragSession.fromIndex);
    if (!tab) {
      await cancel();
      return;
    }

    const requestId = `cwdrag-transfer-${dragSession.dragId}`;
    pendingOutgoingTabTransfers.set(requestId, {
      kind: isPathMode ? "sidebar-drag" : "single-drag",
      tabCount: 1,
      fromIndex: isPathMode ? -1 : dragSession.fromIndex,
    });

    const savedSession = dragSession.snapshotAndReset();

    try {
      await invoke("route_tab_transfer", {
        sourceLabel: state.windowLabel,
        targetLabel: savedSession.targetLabel,
        requestId,
        tabs: [tab],
      });
    } catch (error) {
      pendingOutgoingTabTransfers.delete(requestId);
      setStatus(String(error), true);
    }

    invoke("focus_window", { label: savedSession.targetLabel }).catch(() => {});

    try {
      await invoke("cancel_cross_window_drag_hover", {
        dragId: savedSession.dragId,
      });
    } catch {
      // best-effort cleanup
    }
  }

  async function completeDropAsNewWindow(screenX, screenY) {
    if (!dragSession.dragId) {
      return;
    }

    const isPathMode = dragSession.dragMode === "path";
    const tab = isPathMode ? null : snapshotSingleTab(dragSession.fromIndex);
    const path = isPathMode ? dragSession.dragPath : (tab?.path ?? null);

    if ((isPathMode && !path) || (!isPathMode && !tab)) {
      await cancel();
      return;
    }

    const physicalX = Math.round(screenX * window.devicePixelRatio);
    const physicalY = Math.round(screenY * window.devicePixelRatio);
    const savedSession = dragSession.snapshotAndReset();

    let newWindowLabel;
    try {
      newWindowLabel = await invoke("create_window_from_drag", {
        physicalX,
        physicalY,
        path,
      });
    } catch (error) {
      setStatus(String(error), true);
      try {
        await invoke("cancel_cross_window_drag_hover", {
          dragId: savedSession.dragId,
        });
      } catch {
        // best-effort
      }
      return;
    }

    if (!isPathMode && !path && newWindowLabel && tab) {
      const requestId = `cwdrag-transfer-${savedSession.dragId}-new-window`;
      pendingOutgoingTabTransfers.set(requestId, {
        kind: "single-drag",
        tabCount: 1,
        fromIndex: savedSession.fromIndex,
      });
      try {
        await invoke("route_tab_transfer", {
          sourceLabel: state.windowLabel,
          targetLabel: newWindowLabel,
          requestId,
          tabs: [tab],
        });
      } catch {
        pendingOutgoingTabTransfers.delete(requestId);
      }
    }

    if (!isPathMode) {
      removeTabFromSource(savedSession.fromIndex);
    }

    try {
      await invoke("cancel_cross_window_drag_hover", {
        dragId: savedSession.dragId,
      });
    } catch {
      // best-effort cleanup
    }
  }

  return {
    activate: (index) => dragSession.activate(index),
    activateForPath: (path, previewInfo) =>
      dragSession.activateForPath(path, previewInfo),
    setPreviewInfo: (info) => dragSession.setPreviewInfo(info),
    isActive: () => dragSession.isActive(),
    currentTargetLabel: () => dragSession.targetLabel,
    clearPreview,
    reportPosition,
    cancel,
    completeDrop,
    completeDropAsNewWindow,
    handleDragEnter: (tabName) => dropZone.showDropZone(tabName),
    handleDragLeave: () => dropZone.hideDropZone(),
  };
}
