export function isEditableState(state) {
  if (!state.activePath) {
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

export function createEditorController({
  state,
  invoke,
  setStatus,
  render,
  hasTabSession,
  onFileSaved = null,
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

    state.markdownViewMode = state.markdownViewMode === "preview" ? "edit" : "preview";
    render();
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

  function scheduleAutosave(saveNow) {
    if (!isEditableState(state)) {
      return;
    }

    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      saveNow();
    }, 500);
  }

  async function saveNow() {
    if (!state.activePath || !state.isDirty || !isEditableState(state) || state.isSaving) {
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
      setStatus("Saved");
    } catch (error) {
      setStatus(String(error), true);
    } finally {
      state.isSaving = false;
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
    }
  }

  return {
    updateMenuState,
    toggleMarkdownMode,
    toggleSidebarVisibility,
    scheduleAutosave,
    saveNow,
    isEditable: () => isEditableState(state),
  };
}
