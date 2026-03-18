import { findMatches } from "./find-engine.js";
import {
  clearHighlights,
  highlightMatches,
  scrollToActiveMatch,
  setActiveHighlight,
} from "./find-highlights.js";

export function createFindController({ state, el, codeJarController }) {
  let matches = [];
  let activeIndex = -1;
  let isOpen = false;

  function getActiveView() {
    if (state.activeKind === "code") {
      return "code";
    }
    if (
      state.activeKind === "markdown" &&
      state.markdownViewMode === "preview"
    ) {
      return "preview";
    }
    return "editor";
  }

  function getDomContainer() {
    const view = getActiveView();
    if (view === "code") return el.codeEditor;
    if (view === "preview") return el.preview;
    return null;
  }

  function updateCounter() {
    if (matches.length === 0) {
      el.findCount.textContent = el.findInput.value ? "No results" : "";
    } else {
      el.findCount.textContent = `${activeIndex + 1} of ${matches.length}`;
    }
  }

  function applyHighlights() {
    const query = el.findInput.value;
    const view = getActiveView();
    const domContainer = getDomContainer();

    if (domContainer) {
      clearHighlights(domContainer);
    }

    if (!query) {
      matches = [];
      activeIndex = -1;
      updateCounter();
      return;
    }

    if (view === "editor") {
      matches = findMatches(state.content, query);
    } else {
      const count = highlightMatches(domContainer, query, 0);
      matches = new Array(count);
    }

    if (matches.length === 0) {
      activeIndex = -1;
      updateCounter();
      return;
    }

    activeIndex = 0;

    if (view === "editor") {
      const m = matches[0];
      el.editor.setSelectionRange(m.index, m.index + m.length);
    } else {
      scrollToActiveMatch(domContainer);
    }

    updateCounter();
  }

  function navigateTo(index) {
    if (matches.length === 0) return;

    activeIndex = index;
    if (activeIndex >= matches.length) activeIndex = 0;
    if (activeIndex < 0) activeIndex = matches.length - 1;

    const view = getActiveView();

    if (view === "editor") {
      const m = matches[activeIndex];
      el.editor.setSelectionRange(m.index, m.index + m.length);
      el.editor.blur();
      el.editor.focus();
      el.findInput.focus();
    } else {
      setActiveHighlight(getDomContainer(), activeIndex);
    }

    updateCounter();
  }

  function onKeydown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        navigateTo(activeIndex - 1);
      } else {
        navigateTo(activeIndex + 1);
      }
    }
  }

  function onDocumentKeydown(event) {
    if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      close();
    }
  }

  function open() {
    if (!state.activePath) return;

    isOpen = true;
    el.findBar.classList.remove("hidden");
    el.findInput.focus();

    if (el.findInput.value) {
      el.findInput.select();
      applyHighlights();
    }
  }

  function close() {
    if (!isOpen) return;

    isOpen = false;

    const domContainer = getDomContainer();
    if (domContainer) {
      clearHighlights(domContainer);
    }

    const view = getActiveView();
    if (view === "code" && codeJarController?.isAttached()) {
      codeJarController.syncContent(state.content);
    }

    el.findBar.classList.add("hidden");
    el.findInput.value = "";
    matches = [];
    activeIndex = -1;
    el.findCount.textContent = "";

    const focusTarget = domContainer || el.editor;
    if (focusTarget && typeof focusTarget.focus === "function") {
      focusTarget.focus();
    }
  }

  function bind() {
    el.findInput.addEventListener("input", applyHighlights);
    el.findInput.addEventListener("keydown", onKeydown);
    el.findPrev.addEventListener("click", () => navigateTo(activeIndex - 1));
    el.findNext.addEventListener("click", () => navigateTo(activeIndex + 1));
    el.findClose.addEventListener("click", () => close());
    document.addEventListener("keydown", onDocumentKeydown);
  }

  bind();

  return {
    open,
    close,
    get isOpen() {
      return isOpen;
    },
  };
}
