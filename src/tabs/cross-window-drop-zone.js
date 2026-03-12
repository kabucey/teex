function isEmptyUntitledTab(state) {
  return (
    state.openFiles.length === 1 &&
    !state.openFiles[0].path &&
    !state.openFiles[0].isDirty &&
    !state.openFiles[0].content
  );
}

export function createCrossWindowDropZone({ state, el }) {
  let savedTabLabel = null;

  function showDropZone(incomingTabName) {
    if (el.tabBarRow) {
      el.tabBarRow.classList.remove("hidden");
    }
    el.tabBar.classList.add("tab-bar-drop-target");

    if (incomingTabName && isEmptyUntitledTab(state)) {
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
    if (el.tabBarRow && state.openFiles.length === 0) {
      el.tabBarRow.classList.add("hidden");
    }
  }

  return {
    hideDropZone,
    showDropZone,
  };
}
