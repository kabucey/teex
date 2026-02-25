export function createAppEventsController({
  state,
  invoke,
  listen,
  events,
  openSingleFileFromUi,
  openFolder,
  handleOsOpenFiles,
  toggleSidebarVisibility,
  toggleMarkdownMode,
  closeActiveFileOrWindow,
  handleRequestExportAllTabs,
  handleReceiveTransferredTabs,
  handleTabTransferResult,
  bindWindowDragDropEvents,
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
      listen(`${events.toggleSidebar}/${label}`, () => {
        toggleSidebarVisibility();
      }),
      listen(`${events.toggleMarkdownMode}/${label}`, () => {
        toggleMarkdownMode();
      }),
      listen(`${events.closeActiveFile}/${label}`, async () => {
        await closeActiveFileOrWindow();
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
      bindWindowDragDropEvents(),
    ]);
  }

  return {
    bindAppEvents,
  };
}
