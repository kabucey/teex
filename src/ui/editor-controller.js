export function isEditableState(state) {
  const openFiles = state.openFiles || [];
  const isUntitled = !state.activePath && openFiles.length > 0 && openFiles[state.activeTabIndex]?.path === null;
  if (!state.activePath && !isUntitled) {
    return false;
  }

  if (state.activeKind === "markdown") {
    return state.markdownViewMode === "edit";
  }

  return true;
}

export function buildMenuStatePayload(state) {
  return {
    canToggleSidebar: state.mode === "folder",
    canToggleMarkdownMode: state.activeKind === "markdown",
  };
}

export function shouldAutosaveOnToggle(state) {
  return Boolean(state.activePath) && state.isDirty;
}

export function createEditorController({
  state,
  invoke,
  setStatus,
  render,
  hasTabSession,
  onFileSaved = null,
  onBeforeToggleMarkdownMode = null,
  onAfterToggleMarkdownMode = null,
  onSavedStateChanged = null,
}) {
  function updateMenuState() {
    invoke("set_menu_state", {
      state: buildMenuStatePayload(state),
    }).catch((error) => {
      setStatus(String(error), true);
    });
  }

  function toggleMarkdownMode() {
    if (state.activeKind !== "markdown") {
      return;
    }

    const previousMode = state.markdownViewMode;
    if (typeof onBeforeToggleMarkdownMode === "function") {
      onBeforeToggleMarkdownMode();
    }
    state.markdownViewMode = state.markdownViewMode === "preview" ? "edit" : "preview";
    if (shouldAutosaveOnToggle(state)) {
      saveNow();
    }
    const disableEditorFocus = previousMode === "preview" && state.markdownViewMode === "edit";
    render({ focusEditor: !disableEditorFocus });
    if (typeof onAfterToggleMarkdownMode === "function") {
      onAfterToggleMarkdownMode();
    }
    updateMenuState();
    setStatus(state.markdownViewMode === "preview" ? "Markdown preview" : "Markdown source edit");
  }

  function toggleSidebarVisibility() {
    if (state.mode !== "folder") {
      return;
    }
    state.sidebarVisible = !state.sidebarVisible;
    render();
    updateMenuState();
  }

  async function saveNow() {
    if (state.isSaving) {
      return;
    }

    const isUntitled = !state.activePath && hasTabSession() && state.openFiles[state.activeTabIndex]?.path === null;

    if (isUntitled && state.isDirty) {
      return saveAsUntitled();
    }

    if (!state.activePath || !state.isDirty || !isEditableState(state)) {
      return;
    }

    state.isSaving = true;
    try {
      await invoke("write_text_file", {
        path: state.activePath,
        content: state.content,
      });
      state.isDirty = false;
      if (hasTabSession() && state.openFiles[state.activeTabIndex]) {
        state.openFiles[state.activeTabIndex].isDirty = false;
        state.openFiles[state.activeTabIndex].content = state.content;
      }
      if (typeof onFileSaved === "function") {
        onFileSaved(state.activePath);
      }
      if (typeof onSavedStateChanged === "function") {
        onSavedStateChanged();
      }
      setStatus("Saved");
    } catch (error) {
      setStatus(String(error), true);
    } finally {
      state.isSaving = false;
    }
  }

  async function saveAsUntitled() {
    const { save } = window.__TAURI__.dialog;
    let chosenPath;
    try {
      chosenPath = await save({ title: "Save As" });
    } catch {
      return;
    }
    if (!chosenPath) {
      return;
    }

    state.isSaving = true;
    try {
      await invoke("write_text_file", { path: chosenPath, content: state.content });
      state.activePath = chosenPath;
      state.isDirty = false;

      const ext = chosenPath.split(".").pop()?.toLowerCase();
      const kind = (ext === "md" || ext === "markdown") ? "markdown" : "text";
      state.activeKind = kind;

      const tab = state.openFiles[state.activeTabIndex];
      if (tab) {
        tab.path = chosenPath;
        tab.kind = kind;
        tab.isDirty = false;
        tab.content = state.content;
        if (kind === "markdown") {
          tab.markdownViewMode = "preview";
          state.markdownViewMode = "preview";
        }
      }

      if (typeof onFileSaved === "function") {
        onFileSaved(chosenPath);
      }
      setStatus(`Saved as ${chosenPath.split("/").pop()}`);
      render();
    } catch (error) {
      setStatus(String(error), true);
    } finally {
      state.isSaving = false;
    }
  }

  return {
    updateMenuState,
    toggleMarkdownMode,
    toggleSidebarVisibility,
    saveNow,
    isEditable: () => isEditableState(state),
  };
}
