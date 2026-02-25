export function shouldAutoCloseEmptyWindowAfterTransfer(state, hasTabSession) {
  return state.mode !== "folder" && !hasTabSession() && !state.activePath;
}

export function createTabTransferController({
  state,
  pendingOutgoingTabTransfers,
  invoke,
  setStatus,
  markSidebarTreeDirty,
  render,
  updateMenuState,
  hasTabSession,
  clearActiveFile,
  flushStateToActiveTab,
  syncActiveTabToState,
  normalizeTransferTab,
  snapshotActiveFileAsTransferTab,
  snapshotAllOpenTabsForTransfer,
}) {
  function applyTransferredTabsToCurrentWindow(incomingTabs) {
    const normalizedIncoming = incomingTabs.map(normalizeTransferTab).filter(Boolean);
    if (normalizedIncoming.length === 0) {
      return 0;
    }

    flushStateToActiveTab();

    const existingTabs = hasTabSession()
      ? state.openFiles.map(normalizeTransferTab).filter(Boolean)
      : [];

    if (!hasTabSession()) {
      const activeTab = snapshotActiveFileAsTransferTab();
      if (activeTab) {
        existingTabs.push(activeTab);
      }
    }

    const combinedTabs = [...existingTabs, ...normalizedIncoming];

    if (state.mode !== "folder") {
      state.mode = "files";
      state.sidebarVisible = false;
      state.rootPath = null;
      state.entries = [];
      markSidebarTreeDirty();
    }

    state.openFiles = combinedTabs;
    state.activeTabIndex = Math.min(existingTabs.length, state.openFiles.length - 1);
    syncActiveTabToState();
    render();
    updateMenuState();

    return normalizedIncoming.length;
  }

  async function sendTabTransferResultToSource({ sourceLabel, requestId, acceptedCount }) {
    if (!state.windowLabel || !sourceLabel || !requestId) {
      return;
    }

    await invoke("route_tab_transfer_result", {
      sourceLabel,
      targetLabel: state.windowLabel,
      requestId,
      acceptedCount,
    });
  }

  async function handleRequestExportAllTabs(payload) {
    const requestId = payload?.requestId;
    const targetLabel = payload?.targetLabel;
    if (!requestId || !targetLabel || !state.windowLabel || targetLabel === state.windowLabel) {
      return;
    }

    const snapshot = snapshotAllOpenTabsForTransfer();
    if (snapshot.tabs.length === 0) {
      await sendTabTransferResultToSource({
        sourceLabel: state.windowLabel,
        requestId,
        acceptedCount: 0,
      }).catch(() => {});
      return;
    }

    pendingOutgoingTabTransfers.set(requestId, {
      kind: snapshot.kind,
      tabCount: snapshot.tabs.length,
      singlePath: snapshot.singlePath,
    });

    try {
      await invoke("route_tab_transfer", {
        sourceLabel: state.windowLabel,
        targetLabel,
        requestId,
        tabs: snapshot.tabs,
      });
    } catch (error) {
      pendingOutgoingTabTransfers.delete(requestId);
      setStatus(String(error), true);
    }
  }

  async function handleReceiveTransferredTabs(payload) {
    const requestId = payload?.requestId;
    const sourceLabel = payload?.sourceLabel;
    const tabs = Array.isArray(payload?.tabs) ? payload.tabs : [];

    if (!requestId || !sourceLabel) {
      return;
    }

    let acceptedCount = 0;
    try {
      acceptedCount = applyTransferredTabsToCurrentWindow(tabs);
      if (acceptedCount > 0) {
        setStatus(`Added ${acceptedCount} tab${acceptedCount === 1 ? "" : "s"} from another window`);
      }
    } catch (error) {
      setStatus(String(error), true);
      acceptedCount = 0;
    }

    await sendTabTransferResultToSource({
      sourceLabel,
      requestId,
      acceptedCount,
    }).catch((error) => {
      setStatus(String(error), true);
    });
  }

  async function finalizeOutgoingTabTransfer(pending) {
    if (pending.kind === "tabs") {
      state.openFiles = [];
      state.activeTabIndex = 0;
      clearActiveFile();
      if (state.mode !== "folder") {
        state.mode = "empty";
        markSidebarTreeDirty();
      }
    } else if (pending.kind === "single") {
      if (!hasTabSession() && (!pending.singlePath || state.activePath === pending.singlePath)) {
        clearActiveFile();
        if (state.mode !== "folder") {
          state.mode = "empty";
          markSidebarTreeDirty();
        }
      }
    }

    render();
    updateMenuState();

    if (shouldAutoCloseEmptyWindowAfterTransfer(state, hasTabSession)) {
      await invoke("close_current_window").catch((error) => {
        setStatus(String(error), true);
      });
    }
  }

  async function handleTabTransferResult(payload) {
    const requestId = payload?.requestId;
    if (!requestId) {
      return;
    }

    const pending = pendingOutgoingTabTransfers.get(requestId);
    if (!pending) {
      return;
    }
    pendingOutgoingTabTransfers.delete(requestId);

    const acceptedCount = Number.isFinite(payload?.acceptedCount) ? payload.acceptedCount : 0;
    if (acceptedCount <= 0) {
      return;
    }

    if (acceptedCount !== pending.tabCount) {
      setStatus("Tab merge completed partially; source window was left unchanged", true);
      return;
    }

    await finalizeOutgoingTabTransfer(pending);
    setStatus(`Moved ${acceptedCount} tab${acceptedCount === 1 ? "" : "s"} to another window`);
  }

  return {
    handleRequestExportAllTabs,
    handleReceiveTransferredTabs,
    handleTabTransferResult,
  };
}
