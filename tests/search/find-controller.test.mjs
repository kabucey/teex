import assert from "node:assert/strict";
import test from "node:test";
import { createFindController } from "../../src/search/find-controller.js";

// Minimal DOM shims for Node (find-highlights.js needs these for preview mode)
if (!globalThis.document) globalThis.document = {};
if (!globalThis.NodeFilter) globalThis.NodeFilter = { SHOW_TEXT: 4 };
if (!globalThis.document.createTreeWalker) {
  globalThis.document.createTreeWalker = () => ({
    nextNode() {
      return null;
    },
  });
}
if (!globalThis.document.createRange) {
  globalThis.document.createRange = () => ({
    setStart() {},
    setEnd() {},
    surroundContents() {},
  });
}

function mockElement() {
  const listeners = {};
  return {
    classList: {
      _classes: new Set(["hidden"]),
      add(c) {
        this._classes.add(c);
      },
      remove(c) {
        this._classes.delete(c);
      },
      contains(c) {
        return this._classes.has(c);
      },
    },
    value: "",
    textContent: "",
    innerHTML: "",
    focus() {},
    select() {},
    blur() {},
    setSelectionRange() {},
    addEventListener(event, handler) {
      listeners[event] = listeners[event] || [];
      listeners[event].push(handler);
    },
    removeEventListener() {},
    querySelectorAll() {
      return [];
    },
    normalize() {},
    scrollTop: 0,
    _listeners: listeners,
  };
}

function setup(stateOverrides = {}) {
  const state = {
    activePath: null,
    activeKind: "markdown",
    markdownViewMode: "edit",
    content: "",
    ...stateOverrides,
  };
  const el = {
    findBar: mockElement(),
    findInput: mockElement(),
    findCount: mockElement(),
    findPrev: mockElement(),
    findNext: mockElement(),
    findClose: mockElement(),
    editor: mockElement(),
    editorBackdrop: mockElement(),
    codeEditor: mockElement(),
    preview: mockElement(),
  };
  const origAdd = globalThis.document?.addEventListener;
  if (!globalThis.document) globalThis.document = {};
  globalThis.document.addEventListener = () => {};
  const controller = createFindController({
    state,
    el,
    codeJarController: null,
  });
  if (origAdd) globalThis.document.addEventListener = origAdd;
  return { state, el, controller };
}

function typeQuery(el, value) {
  el.findInput.value = value;
  const handlers = el.findInput._listeners.input || [];
  for (const h of handlers) h();
}

// --- Basic open tests ---

test("open works on unsaved file with null activePath", () => {
  const { el, controller } = setup({
    activePath: null,
    content: "hello world",
  });
  controller.open();
  assert.equal(controller.isOpen, true);
  assert.equal(el.findBar.classList.contains("hidden"), false);
});

test("open works on saved file with activePath set", () => {
  const { el, controller } = setup({
    activePath: "/tmp/test.md",
    content: "hello",
  });
  controller.open();
  assert.equal(controller.isOpen, true);
  assert.equal(el.findBar.classList.contains("hidden"), false);
});

// --- Backdrop tests ---

test("open in editor mode shows backdrop", () => {
  const { el, controller } = setup({ content: "hello" });
  controller.open();
  assert.equal(el.editorBackdrop.classList.contains("hidden"), false);
  assert.equal(el.editor.classList.contains("find-active-editor"), true);
});

test("close hides backdrop", () => {
  const { el, controller } = setup({ content: "hello" });
  controller.open();
  controller.close();
  assert.equal(el.editorBackdrop.classList.contains("hidden"), true);
  assert.equal(el.editor.classList.contains("find-active-editor"), false);
});

test("search in editor mode populates backdrop with marks", () => {
  const { el, controller } = setup({ content: "hello world hello" });
  controller.open();
  typeQuery(el, "hello");
  assert.ok(el.editorBackdrop.innerHTML.includes("<mark"));
  assert.equal(el.findCount.textContent, "1 of 2");
});

// --- View mode toggle tests ---

test("refresh after edit→preview hides backdrop and clears counter", () => {
  const { state, el, controller } = setup({ content: "hello world" });
  controller.open();
  typeQuery(el, "hello");
  assert.equal(el.findCount.textContent, "1 of 1");
  assert.equal(el.editorBackdrop.classList.contains("hidden"), false);

  // Simulate toggle to preview
  state.markdownViewMode = "preview";
  controller.refresh();

  // Backdrop should be hidden
  assert.equal(el.editorBackdrop.classList.contains("hidden"), true);
  assert.equal(el.editor.classList.contains("find-active-editor"), false);
  // Find bar should still be open
  assert.equal(controller.isOpen, true);
  assert.equal(el.findBar.classList.contains("hidden"), false);
});

test("refresh after preview→edit shows backdrop with highlights", () => {
  const { state, el, controller } = setup({
    content: "hello world",
    markdownViewMode: "preview",
  });
  controller.open();
  typeQuery(el, "hello");
  // In preview mode, backdrop should be hidden
  assert.equal(el.editorBackdrop.classList.contains("hidden"), true);

  // Simulate toggle to edit
  state.markdownViewMode = "edit";
  controller.refresh();

  // Backdrop should now be visible with highlights
  assert.equal(el.editorBackdrop.classList.contains("hidden"), false);
  assert.equal(el.editor.classList.contains("find-active-editor"), true);
  assert.ok(el.editorBackdrop.innerHTML.includes("<mark"));
  assert.equal(el.findCount.textContent, "1 of 1");
});

test("refresh preserves find bar open state and query", () => {
  const { state, el, controller } = setup({ content: "foo bar foo" });
  controller.open();
  typeQuery(el, "foo");
  assert.equal(el.findCount.textContent, "1 of 2");

  state.markdownViewMode = "preview";
  controller.refresh();

  assert.equal(controller.isOpen, true);
  assert.equal(el.findInput.value, "foo");
  assert.equal(el.findBar.classList.contains("hidden"), false);
});

test("refresh with no query does not crash", () => {
  const { state, el, controller } = setup({ content: "hello" });
  controller.open();
  // No query typed

  state.markdownViewMode = "preview";
  controller.refresh();

  assert.equal(controller.isOpen, true);
  assert.equal(el.findCount.textContent, "");
});

test("refresh when find is closed is a no-op", () => {
  const { state, el, controller } = setup({ content: "hello" });
  // Find not opened
  state.markdownViewMode = "preview";
  controller.refresh();

  assert.equal(controller.isOpen, false);
  assert.equal(el.editorBackdrop.classList.contains("hidden"), true);
});

test("edit→preview→search→edit shows editor highlights", () => {
  const { state, el, controller } = setup({ content: "abc def abc" });

  // Start in edit, open find, search
  controller.open();
  typeQuery(el, "abc");
  assert.ok(el.editorBackdrop.innerHTML.includes("<mark"));

  // Toggle to preview
  state.markdownViewMode = "preview";
  controller.refresh();
  assert.equal(el.editorBackdrop.classList.contains("hidden"), true);

  // Toggle back to edit
  state.markdownViewMode = "edit";
  controller.refresh();
  assert.equal(el.editorBackdrop.classList.contains("hidden"), false);
  assert.ok(el.editorBackdrop.innerHTML.includes("<mark"));
  assert.equal(el.findCount.textContent, "1 of 2");
});
