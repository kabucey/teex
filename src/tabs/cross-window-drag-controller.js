import { baseName } from "../app-utils.js";
import { shouldShowTabBar } from "../ui/behavior.js";
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
  let dragMode = "tab";
  let dragPath = null;
  let dragPreviewInfo = null;

  function activate(index) {
    dragId = `cwdrag-${nextDragId++}`;
    fromIndex = index;
    targetLabel = null;
    reporting = false;
    previewVisible = false;
    dragMode = "tab";
    dragPath = null;
    dragPreviewInfo = null;
  }

  function activateForPath(path, previewInfo) {
    dragId = `cwdrag-${nextDragId++}`;
    dragMode = "path";
    dragPath = path;
    dragPreviewInfo = previewInfo || { title: baseName(path), content: "" };
    fromIndex = -1;
    targetLabel = null;
    reporting = false;
    previewVisible = false;
  }

  function setPreviewInfo(info) {
    if (dragId && dragMode === "path" && info) {
      dragPreviewInfo = info;
    }
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
    const title = tab?.path
      ? baseName(tab.path)
      : state.activePath
        ? baseName(state.activePath)
        : "Untitled";
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
      const info =
        dragMode === "path" ? dragPreviewInfo : getTabPreviewInfo(fromIndex);
      const result = await invoke("report_drag_position", {
        dragId,
        sourceLabel: state.windowLabel,
        physicalX,
        physicalY,
        tabName: info.title,
      });
      targetLabel = result ?? null;

      if (targetLabel) {
        if (previewVisible) {
          invoke("hide_tab_drag_preview").catch(() => {});
          previewVisible = false;
        }
      } else {
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

  function clearPreview() {
    if (previewVisible) {
      invoke("hide_tab_drag_preview").catch(() => {});
      previewVisible = false;
    }
    targetLabel = null;
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
    dragMode = "tab";
    dragPath = null;
    dragPreviewInfo = null;
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

    const isPathMode = dragMode === "path";
    const tab = isPathMode
      ? {
          path: dragPath,
          content: dragPreviewInfo?.content ?? "",
          kind: "text",
          writable: true,
          isDirty: false,
          markdownViewMode: "edit",
          scrollState: { editorScrollTop: 0, previewScrollTop: 0 },
        }
      : snapshotSingleTab(fromIndex);
    if (!tab) {
      await cancel();
      return;
    }

    const requestId = `cwdrag-transfer-${nextDragId++}`;
    pendingOutgoingTabTransfers.set(requestId, {
      kind: isPathMode ? "sidebar-drag" : "single-drag",
      tabCount: 1,
      fromIndex: isPathMode ? -1 : fromIndex,
    });

    const savedDragId = dragId;
    const savedTargetLabel = targetLabel;
    dragId = null;
    fromIndex = -1;
    targetLabel = null;
    reporting = false;
    previewVisible = false;
    dragMode = "tab";
    dragPath = null;
    dragPreviewInfo = null;

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

    invoke("focus_window", { label: savedTargetLabel }).catch(() => {});

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

    const isPathMode = dragMode === "path";
    const tab = isPathMode ? null : snapshotSingleTab(fromIndex);
    const path = isPathMode ? dragPath : (tab?.path ?? null);

    if (isPathMode && !path) {
      await cancel();
      return;
    }
    if (!isPathMode && !tab) {
      await cancel();
      return;
    }

    const physicalX = Math.round(screenX * window.devicePixelRatio);
    const physicalY = Math.round(screenY * window.devicePixelRatio);

    const savedDragId = dragId;
    const savedFromIndex = fromIndex;
    const savedIsPathMode = isPathMode;
    dragId = null;
    fromIndex = -1;
    targetLabel = null;
    reporting = false;
    previewVisible = false;
    dragMode = "tab";
    dragPath = null;
    dragPreviewInfo = null;

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
        await invoke("cancel_cross_window_drag_hover", { dragId: savedDragId });
      } catch {
        // best-effort
      }
      return;
    }

    if (!savedIsPathMode && !path && newWindowLabel && tab) {
      const requestId = `cwdrag-transfer-${nextDragId++}`;
      pendingOutgoingTabTransfers.set(requestId, {
        kind: "single-drag",
        tabCount: 1,
        fromIndex: savedFromIndex,
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

    if (!savedIsPathMode) {
      removeTabFromSource(savedFromIndex);
    }

    try {
      await invoke("cancel_cross_window_drag_hover", { dragId: savedDragId });
    } catch {
      // best-effort cleanup
    }
  }

  let savedTabLabel = null;

  function isEmptyUntitledTab() {
    return (
      state.openFiles.length === 1 &&
      !state.openFiles[0].path &&
      !state.openFiles[0].isDirty &&
      !state.openFiles[0].content
    );
  }

  function showDropZone(incomingTabName) {
    el.tabBar.classList.remove("hidden");
    el.tabBar.classList.add("tab-bar-drop-target");

    if (incomingTabName && isEmptyUntitledTab()) {
      const labelEl = el.tabBar.querySelector(".tab-label");
      if (labelEl) {
        savedTabLabel = labelEl.textContent;
        labelEl.textContent = incomingTabName;
      }
    }
  }

  function hideDropZone() {
    if (savedTabLabel !== null) {
      const labelEl = el.tabBar.querySelector(".tab-label");
      if (labelEl) {
        labelEl.textContent = savedTabLabel;
      }
      savedTabLabel = null;
    }
    el.tabBar.classList.remove("tab-bar-drop-target");
    el.tabBar.classList.toggle(
      "hidden",
      !shouldShowTabBar(state.openFiles.length),
    );
  }

  function handleDragEnter(tabName) {
    showDropZone(tabName);
  }

  function handleDragLeave() {
    hideDropZone();
  }

  return {
    activate,
    activateForPath,
    setPreviewInfo,
    isActive,
    currentTargetLabel,
    clearPreview,
    reportPosition,
    cancel,
    completeDrop,
    completeDropAsNewWindow,
    handleDragEnter,
    handleDragLeave,
  };
}
