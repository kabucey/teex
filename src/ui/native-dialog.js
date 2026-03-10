const { ask } = window.__TAURI__.dialog;

export async function confirmDelete(fileName) {
  return ask(
    "You can restore this file from the Trash.",
    {
      title: `Are you sure you want to delete '${fileName}'?`,
      kind: "warning",
      okLabel: "Move to Trash",
      cancelLabel: "Cancel",
    },
  );
}

export async function confirmReloadExternalChange(fileName) {
  return ask(
    "Reload and discard unsaved changes?",
    {
      title: `"${fileName}" changed outside Teex.`,
      kind: "warning",
      okLabel: "Reload",
      cancelLabel: "Keep Local",
    },
  );
}
