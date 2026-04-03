export function createAppEventsController({
  state,
  invoke,
  listen,
  events,
  openSingleFileFromUi,
  openFolder,
  handleOsOpenFiles,
  handleProjectFolderChanged,
  handleProjectFileChanged,
  toggleSidebarVisibility,
  toggleMarkdownMode,
  closeActiveFileOrWindow,
  handleRequestExportAllTabs,
  handleReceiveTransferredTabs,
  handleTabTransferResult,
  bindWindowDragDropEvents,
  createNewTab,
  restoreLastSession,
  handleCrossWindowDragEnter,
  handleCrossWindowDragLeave,
  handleContextMenuDelete,
  handleTabContextMenuClose,
  handleTabContextMenuCloseOthers,
  openRecentFolder,
  toggleStatusBar,
  toggleCollapseAllFolders,
  openFind,
  formatActiveFile,
  navigateBack,
  navigateForward,
}) {
  async function bindAppEvents() {
    const label = await invoke("get_window_label");
    state.windowLabel = label;
    await Promise.all([
      listen(`${events.openFileSelected}/${label}`, async (event) => {
        await openSingleFileFromUi(event.payload);
      }),
      listen(`${events.openFolderSelected}/${label}`, async (event) => {
        await openFolder(event.payload);
      }),
      listen(`${events.osOpenPaths}/${label}`, async (event) => {
        await handleOsOpenFiles(event.payload);
      }),
      listen(`${events.projectFolderChanged}/${label}`, async () => {
        await handleProjectFolderChanged();
      }),
      listen(`${events.projectFileChanged}/${label}`, async (event) => {
        await handleProjectFileChanged(event.payload);
      }),
      listen(`${events.toggleSidebar}/${label}`, () => {
        toggleSidebarVisibility();
      }),
      listen(`${events.toggleMarkdownMode}/${label}`, () => {
        toggleMarkdownMode();
      }),
      listen(`${events.closeActiveFile}/${label}`, async () => {
        await closeActiveFileOrWindow();
      }),
      listen(`${events.newTab}/${label}`, () => {
        createNewTab();
      }),
      listen(`${events.requestExportAllTabs}/${label}`, async (event) => {
        await handleRequestExportAllTabs(event.payload);
      }),
      listen(`${events.receiveTransferredTabs}/${label}`, async (event) => {
        await handleReceiveTransferredTabs(event.payload);
      }),
      listen(`${events.tabTransferResult}/${label}`, async (event) => {
        await handleTabTransferResult(event.payload);
      }),
      listen(`${events.restoreSession}/${label}`, async () => {
        await restoreLastSession();
      }),
      listen(`${events.crossWindowDragEnter}/${label}`, (event) => {
        handleCrossWindowDragEnter(event.payload);
      }),
      listen(`${events.crossWindowDragLeave}/${label}`, () => {
        handleCrossWindowDragLeave();
      }),
      listen(`${events.contextMenuDelete}/${label}`, async (event) => {
        await handleContextMenuDelete(event.payload);
      }),
      listen(`${events.tabContextMenuClose}/${label}`, async (event) => {
        await handleTabContextMenuClose(event.payload);
      }),
      listen(`${events.tabContextMenuCloseOthers}/${label}`, async (event) => {
        await handleTabContextMenuCloseOthers(event.payload);
      }),
      listen(`${events.openRecentFile}/${label}`, async (event) => {
        await openSingleFileFromUi(event.payload);
      }),
      listen(`${events.openRecentFolder}/${label}`, async (event) => {
        await openRecentFolder(event.payload);
      }),
      listen(`${events.toggleStatusBar}/${label}`, () => {
        toggleStatusBar();
      }),
      listen(`${events.toggleCollapseAllFolders}/${label}`, () => {
        toggleCollapseAllFolders();
      }),
      listen(`${events.find}/${label}`, () => {
        openFind();
      }),
      listen(`${events.formatFile}/${label}`, () => {
        formatActiveFile();
      }),
      listen(`${events.mouseNavBack}/${label}`, () => {
        navigateBack();
      }),
      listen(`${events.mouseNavForward}/${label}`, () => {
        navigateForward();
      }),
      bindWindowDragDropEvents(),
    ]);
  }

  return {
    bindAppEvents,
  };
}
