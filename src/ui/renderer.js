import {
  bindTabBarEvents,
  buildTabBarHtml,
  updateNavButtons,
} from "../tabs/tab-bar.js";
import { baseName, dirName, fileLanguageKey } from "../utils/app-utils.js";
import { hasActiveContent, isUntitledTab } from "./behavior.js";
import { rewritePreviewImages } from "./image-paths.js";
import {
  addCopyButtons,
  renderMarkdown,
  renderMermaidDiagrams,
} from "./markdown-renderer.js";

export function createUiRenderer({
  state,
  el,
  invoke,
  renderSidebar,
  switchTab,
  moveTab,
  closeTab,
  closeActiveFileOrWindow,
  crossWindowDrag,
  codeJarController,
}) {
  function syncWindowTitle() {
    const { nextTitle, nextRepresentedPath } = buildWindowTitleState(state);

    if (
      nextTitle === state.windowTitle &&
      nextRepresentedPath === state.windowRepresentedPath
    ) {
      return;
    }

    state.windowTitle = nextTitle;
    state.windowRepresentedPath = nextRepresentedPath;
    document.title = nextTitle;
    invoke("set_window_title", {
      title: nextTitle,
      representedPath: nextRepresentedPath,
    }).catch((error) => {
      console.error(String(error));
    });
  }

  function renderTabBar() {
    const hasFile = state.openFiles.length > 0 || Boolean(state.activePath);
    if (el.tabBarRow) {
      el.tabBarRow.classList.toggle("hidden", !hasFile);
    }

    updateNavButtons(state, el);
    el.tabBar.innerHTML = buildTabBarHtml(state);
    bindTabBarEvents({
      el,
      state,
      invoke,
      switchTab,
      moveTab,
      closeTab,
      closeActiveFileOrWindow,
      crossWindowDrag,
    });
  }

  async function renderMainPane(options = {}) {
    const shouldFocusEditor = options.focusEditor !== false;

    if (el.unifiedDiff) {
      el.unifiedDiff.classList.toggle("hidden", state.activeKind !== "diff");
    }

    if (state.activeKind === "diff") {
      el.editor.classList.add("hidden");
      el.preview.classList.add("hidden");
      codeJarController.detach();
      return;
    }

    if (!hasActiveContent(state)) {
      el.editor.classList.add("hidden");
      el.preview.classList.add("hidden");
      codeJarController.detach();
      return;
    }

    if (
      state.activeKind === "markdown" &&
      state.markdownViewMode === "preview"
    ) {
      el.editor.classList.add("hidden");
      el.preview.classList.remove("hidden");
      codeJarController.detach();
      el.preview.innerHTML = await renderMarkdown(state.content);
      addCopyButtons(el.preview);
      if (state.activePath) {
        rewritePreviewImages(el.preview, dirName(state.activePath));
      }
      renderMermaidDiagrams(el.preview).catch((error) => {
        console.error(String(error));
      });
      return;
    }

    if (
      state.activeKind === "code" ||
      (state.activeKind === "markdown" && state.markdownViewMode === "edit")
    ) {
      el.editor.classList.add("hidden");
      el.preview.classList.add("hidden");
      const ext = fileLanguageKey(state.activePath);
      codeJarController.attach(ext);
      codeJarController.syncContent(state.content);
      if (shouldFocusEditor) {
        codeJarController.focus();
      }
      return;
    }

    el.preview.classList.add("hidden");
    el.editor.classList.remove("hidden");
    codeJarController.detach();

    if (el.editor.value !== state.content) {
      el.editor.value = state.content;
      el.editor.selectionStart = 0;
      el.editor.selectionEnd = 0;
    }

    if (shouldFocusEditor) {
      el.editor.focus();
    }
  }

  function renderStatusBar() {
    const visible =
      state.statusBarVisible &&
      hasActiveContent(state) &&
      state.activeKind !== "diff";
    el.statusBar.classList.toggle("hidden", !visible);
    if (visible) {
      const lines = state.content.split("\n").length;
      el.statusBarLines.textContent = `${lines} line${lines !== 1 ? "s" : ""}`;
    }
  }

  function renderChrome() {
    syncWindowTitle();
    renderTabBar();
    renderStatusBar();
  }

  function render(options = {}) {
    renderChrome();

    const showSidebar = state.mode === "folder" && state.sidebarVisible;
    el.workspace.className = showSidebar
      ? "workspace workspace-folder"
      : "workspace workspace-empty";
    el.sidebar.classList.toggle("hidden", !showSidebar);
    el.sidebarResizer.classList.toggle("hidden", !showSidebar);
    if (showSidebar) {
      el.workspace.style.setProperty(
        "--sidebar-width",
        `${state.sidebarWidth}px`,
      );
    } else {
      el.workspace.style.removeProperty("--sidebar-width");
    }

    renderSidebar();
    renderMainPane(options);
  }

  return {
    render,
    renderChrome,
  };
}

export function buildWindowTitleState(state) {
  const nextRepresentedPath =
    state.mode === "folder" ? state.rootPath || null : state.activePath || null;
  const untitled = isUntitledTab(state);
  const baseTitle = untitled
    ? "Untitled"
    : nextRepresentedPath
      ? baseName(nextRepresentedPath)
      : "Teex";
  const hasUnsavedChanges =
    state.isDirty && (Boolean(state.activePath) || untitled);
  const nextTitle = hasUnsavedChanges ? `${baseTitle}  ●` : baseTitle;

  return {
    nextTitle,
    nextRepresentedPath,
  };
}
