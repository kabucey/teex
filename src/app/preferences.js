import { loadSidebarWidth } from "./sidebar-width-persistence.js";

export function applySavedTheme() {
  const saved = localStorage.getItem("teex-theme");
  if (saved === "light" || saved === "dark") {
    document.documentElement.setAttribute("data-theme", saved);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export function applySavedSidebarWidth(state) {
  state.sidebarWidth = loadSidebarWidth();
}

export function applySavedStatusBar(state) {
  state.statusBarVisible = localStorage.getItem("teex-status-bar") === "true";
}

export function applySavedShowHiddenFiles(state) {
  const saved = localStorage.getItem("teex-show-hidden-files");
  state.showHiddenFiles = saved === null ? true : saved === "true";
}

export function applySavedModifiedOnly(state) {
  state.filterModifiedOnly =
    localStorage.getItem("teex-filter-modified-only") === "true";
}

export function toggleStatusBar(state, render) {
  state.statusBarVisible = !state.statusBarVisible;
  localStorage.setItem(
    "teex-status-bar",
    state.statusBarVisible ? "true" : "false",
  );
  render();
}

export function toggleHiddenFiles(state, invoke, refreshEntries) {
  state.showHiddenFiles = !state.showHiddenFiles;
  localStorage.setItem(
    "teex-show-hidden-files",
    state.showHiddenFiles ? "true" : "false",
  );
  invoke("set_show_hidden_files_checked", {
    checked: state.showHiddenFiles,
  }).catch(() => {});
  refreshEntries();
}

export function toggleModifiedOnly(
  state,
  invoke,
  markSidebarTreeDirty,
  render,
) {
  state.filterModifiedOnly = !state.filterModifiedOnly;
  localStorage.setItem(
    "teex-filter-modified-only",
    state.filterModifiedOnly ? "true" : "false",
  );
  invoke("set_show_modified_only_checked", {
    checked: state.filterModifiedOnly,
  }).catch(() => {});
  markSidebarTreeDirty();
  render();
}

export function syncSavedPreferencesToBackend(state, invoke) {
  const savedTheme = localStorage.getItem("teex-theme");
  if (savedTheme) {
    invoke("set_theme", { theme: savedTheme }).catch(() => {});
  }
  invoke("set_show_hidden_files_checked", {
    checked: state.showHiddenFiles,
  }).catch(() => {});
  invoke("set_show_modified_only_checked", {
    checked: state.filterModifiedOnly,
  }).catch(() => {});
}

export function listenForThemeEvents(listen) {
  listen("teex://set-theme", (event) => {
    const theme = event.payload;
    localStorage.setItem("teex-theme", theme);
    if (theme === "light" || theme === "dark") {
      document.documentElement.setAttribute("data-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  });
}
