import { CodeJar } from "/vendor/codejar.js";
import { prismLanguageForExtension } from "./prism-languages.js";

function createHighlighter(language) {
  const grammar = language ? window.Prism?.languages[language] : null;
  if (!grammar) {
    return () => {};
  }
  return (el) => {
    el.innerHTML = window.Prism.highlight(el.textContent, grammar, language);
  };
}

export function createCodeJarController({
  el,
  state,
  onContentChange,
  onScroll,
}) {
  let jar = null;
  let currentLanguage = null;
  let scrollHandler = null;
  let isSyncing = false;

  function attach(extension) {
    const language = prismLanguageForExtension(extension);
    if (jar && currentLanguage === language) {
      return;
    }

    detach();
    currentLanguage = language;

    const highlight = createHighlighter(language);

    el.codeEditor.classList.remove("hidden");
    jar = CodeJar(el.codeEditor, highlight, {
      tab: "  ",
      spellcheck: false,
      addClosing: true,
    });

    jar.onUpdate((code) => {
      if (isSyncing) return;
      state.content = code;
      state.isDirty = state.content !== state.savedContent;
      if (typeof onContentChange === "function") {
        onContentChange();
      }
    });

    scrollHandler = () => {
      if (typeof onScroll === "function") {
        onScroll();
      }
    };
    el.codeEditor.addEventListener("scroll", scrollHandler, {
      passive: true,
    });
  }

  function detach() {
    if (jar) {
      jar.destroy();
      jar = null;
    }
    if (scrollHandler) {
      el.codeEditor.removeEventListener("scroll", scrollHandler);
      scrollHandler = null;
    }
    currentLanguage = null;
    if (el.codeEditor) {
      el.codeEditor.classList.add("hidden");
      el.codeEditor.textContent = "";
    }
  }

  function syncContent(content) {
    if (!jar) return;
    if (jar.toString() !== content) {
      isSyncing = true;
      jar.updateCode(content);
      isSyncing = false;
    }
  }

  function focus() {
    if (el.codeEditor) {
      el.codeEditor.focus();
    }
  }

  function isAttached() {
    return jar !== null;
  }

  return {
    attach,
    detach,
    syncContent,
    focus,
    isAttached,
  };
}
