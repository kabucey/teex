import {
  bracketMatching,
  Compartment,
  Decoration,
  defaultKeymap,
  drawSelection,
  EditorState,
  EditorView,
  HighlightStyle,
  highlightSpecialChars,
  history,
  historyKeymap,
  indentOnInput,
  indentWithTab,
  keymap,
  lineNumbers,
  RangeSet,
  StateEffect,
  StateField,
  syntaxHighlighting,
  tags,
} from "/vendor/codemirror.js";
import { languageForExtension } from "./codemirror-languages.js";

const setDiffEffect = StateEffect.define();

const diffField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(decos, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setDiffEffect)) return effect.value;
    }
    return decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const diffAdded = Decoration.line({ class: "cm-diff-added" });

const DIFF_TYPES = {
  added: diffAdded,
};

const DARK_COLORS = {
  comment: "#5c6370",
  punctuation: "#abb2bf",
  property: "#d19a66",
  tag: "#e06c75",
  string: "#98c379",
  operator: "#56b6c2",
  keyword: "#c678dd",
  function: "#61afef",
  type: "#e5c07b",
  variable: "#e06c75",
};

const LIGHT_COLORS = {
  comment: "#6a737d",
  punctuation: "#6b7280",
  property: "#986801",
  tag: "#e45649",
  string: "#50a14f",
  operator: "#0184bc",
  keyword: "#a626a4",
  function: "#4078f2",
  type: "#b08800",
  variable: "#e45649",
};

function buildHighlightStyle(c) {
  return HighlightStyle.define([
    { tag: tags.comment, color: c.comment },
    { tag: tags.lineComment, color: c.comment },
    { tag: tags.blockComment, color: c.comment },
    { tag: tags.docComment, color: c.comment },
    {
      tag: [tags.punctuation, tags.bracket, tags.separator],
      color: c.punctuation,
    },
    { tag: [tags.propertyName, tags.labelName], color: c.property },
    { tag: [tags.tagName], color: c.tag },
    {
      tag: [tags.bool, tags.number, tags.integer, tags.float],
      color: c.property,
    },
    { tag: [tags.atom, tags.constant(tags.variableName)], color: c.property },
    {
      tag: [tags.string, tags.character, tags.special(tags.string)],
      color: c.string,
    },
    { tag: [tags.attributeName], color: c.property },
    { tag: [tags.attributeValue], color: c.string },
    { tag: [tags.operator, tags.url], color: c.operator },
    {
      tag: [tags.keyword, tags.modifier, tags.operatorKeyword],
      color: c.keyword,
    },
    { tag: [tags.controlKeyword], color: c.keyword },
    { tag: [tags.definitionKeyword], color: c.keyword },
    {
      tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
      color: c.function,
    },
    {
      tag: [tags.className, tags.definition(tags.typeName)],
      color: c.function,
    },
    { tag: [tags.typeName], color: c.type },
    { tag: [tags.variableName], color: c.variable },
    { tag: [tags.definition(tags.variableName)], color: c.variable },
    { tag: [tags.regexp], color: c.variable },
    { tag: [tags.self], color: c.variable },
  ]);
}

export function createCodeMirrorController({
  el,
  state,
  onContentChange,
  onScroll,
}) {
  let view = null;
  let currentLanguage = null;
  let isSyncing = false;
  const langCompartment = new Compartment();
  const highlightCompartment = new Compartment();

  function isDark() {
    const explicit = document.documentElement.getAttribute("data-theme");
    if (explicit) return explicit === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function currentHighlightExt() {
    const style = isDark()
      ? buildHighlightStyle(DARK_COLORS)
      : buildHighlightStyle(LIGHT_COLORS);
    return syntaxHighlighting(style);
  }

  function attach(extension) {
    const lang = languageForExtension(extension);
    const langKey = extension ?? "";
    if (view && currentLanguage === langKey) return;

    detach();
    currentLanguage = langKey;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !isSyncing) {
        state.content = update.state.doc.toString();
        state.isDirty = state.content !== state.savedContent;
        if (typeof onContentChange === "function") onContentChange();
      }
    });

    const scrollListener = EditorView.domEventHandlers({
      scroll() {
        if (typeof onScroll === "function") onScroll();
      },
    });

    view = new EditorView({
      parent: el.codeEditor,
      state: EditorState.create({
        doc: "",
        extensions: [
          lineNumbers(),
          drawSelection(),
          highlightSpecialChars(),
          indentOnInput(),
          bracketMatching(),

          history(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          langCompartment.of(lang ? lang : []),
          highlightCompartment.of(currentHighlightExt()),
          diffField,
          updateListener,
          scrollListener,
          EditorView.lineWrapping,
        ],
      }),
    });

    el.codeEditor.classList.remove("hidden");
  }

  function detach() {
    if (view) {
      view.destroy();
      view = null;
    }
    currentLanguage = null;
    if (el.codeEditor) {
      el.codeEditor.classList.add("hidden");
      el.codeEditor.textContent = "";
    }
  }

  function syncContent(content) {
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== content) {
      isSyncing = true;
      view.dispatch({
        changes: { from: 0, to: current.length, insert: content },
      });
      isSyncing = false;
    }
  }

  function focus() {
    if (view) view.focus();
  }

  function isAttached() {
    return view !== null;
  }

  function setDiffDecorations(annotations) {
    if (!view) return;
    const doc = view.state.doc;
    const decos = [];
    for (const ann of annotations) {
      if (ann.line < 1 || ann.line > doc.lines) continue;
      const deco = DIFF_TYPES[ann.diff_type];
      if (!deco) continue;
      const lineObj = doc.line(ann.line);
      decos.push(deco.range(lineObj.from));
    }
    view.dispatch({
      effects: setDiffEffect.of(RangeSet.of(decos, true)),
    });
  }

  function clearDiffDecorations() {
    if (!view) return;
    view.dispatch({
      effects: setDiffEffect.of(Decoration.none),
    });
  }

  function refreshTheme() {
    if (!view) return;
    view.dispatch({
      effects: highlightCompartment.reconfigure(currentHighlightExt()),
    });
  }

  // Watch for theme changes
  const themeObserver = new MutationObserver(() => refreshTheme());
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => refreshTheme());

  function scrollToLine(lineNumber) {
    if (!view) return;
    const doc = view.state.doc;
    if (lineNumber < 1 || lineNumber > doc.lines) return;

    const line = doc.line(lineNumber);
    const block = view.lineBlockAt(line.from);
    const content = view.contentDOM;
    const paddingTop = content
      ? Number.parseFloat(window.getComputedStyle(content).paddingTop) || 0
      : 0;
    const viewportHeight = view.scrollDOM.clientHeight;
    const targetTop = Math.max(
      0,
      block.top - paddingTop - viewportHeight / 3 + block.height / 2,
    );

    view.scrollDOM.scrollTop = targetTop;
  }

  function getLineCount() {
    return view ? view.state.doc.lines : 0;
  }

  return {
    attach,
    detach,
    syncContent,
    focus,
    isAttached,
    setDiffDecorations,
    clearDiffDecorations,
    scrollToLine,
    getLineCount,
  };
}
