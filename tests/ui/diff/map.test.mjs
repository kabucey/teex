import assert from "node:assert/strict";
import { before, describe, it, mock } from "node:test";

import {
  buildDiffTicks,
  tickHeight,
  tickTop,
} from "../../../src/ui/diff/map-math.js";

describe("buildDiffTicks", () => {
  it("returns empty array for empty annotations", () => {
    assert.deepEqual(buildDiffTicks([], 100), []);
  });

  it("returns fraction 0 for line 1", () => {
    const result = buildDiffTicks([{ line: 1, diff_type: "added" }], 100);
    assert.equal(result.length, 1);
    assert.equal(result[0].fraction, 0);
    assert.equal(result[0].diffType, "added");
    assert.equal(result[0].line, 1);
  });

  it("returns fraction (N-1)/N for last line", () => {
    const result = buildDiffTicks([{ line: 100, diff_type: "added" }], 100);
    assert.equal(result[0].fraction, 0.99);
  });

  it("computes correct fraction for middle line", () => {
    const result = buildDiffTicks([{ line: 51, diff_type: "added" }], 100);
    assert.equal(result[0].fraction, 0.5);
  });

  it("filters lines below 1", () => {
    const result = buildDiffTicks(
      [
        { line: 0, diff_type: "added" },
        { line: -1, diff_type: "added" },
      ],
      100,
    );
    assert.deepEqual(result, []);
  });

  it("filters lines beyond totalLines", () => {
    const result = buildDiffTicks([{ line: 101, diff_type: "added" }], 100);
    assert.deepEqual(result, []);
  });

  it("handles single-line file", () => {
    const result = buildDiffTicks([{ line: 1, diff_type: "added" }], 1);
    assert.equal(result.length, 1);
    assert.equal(result[0].fraction, 0);
  });

  it("handles totalLines of 0", () => {
    const result = buildDiffTicks([{ line: 1, diff_type: "added" }], 0);
    assert.deepEqual(result, []);
  });

  it("preserves diff_type as diffType", () => {
    const result = buildDiffTicks([{ line: 5, diff_type: "modified" }], 10);
    assert.equal(result[0].diffType, "modified");
  });

  it("returns ticks sorted by line", () => {
    const result = buildDiffTicks(
      [
        { line: 50, diff_type: "added" },
        { line: 10, diff_type: "added" },
        { line: 90, diff_type: "added" },
      ],
      100,
    );
    assert.equal(result.length, 3);
    assert.ok(result[0].fraction < result[1].fraction);
    assert.ok(result[1].fraction < result[2].fraction);
  });

  it("merges back-to-back same-type lines into one hunk", () => {
    const result = buildDiffTicks(
      [
        { line: 1, diff_type: "added" },
        { line: 2, diff_type: "added" },
        { line: 3, diff_type: "added" },
      ],
      1000,
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].line, 1);
    assert.equal(result[0].endLine, 3);
    assert.equal(result[0].height, 3);
  });

  it("does not merge same-type lines when there is a gap", () => {
    const result = buildDiffTicks(
      [
        { line: 10, diff_type: "added" },
        { line: 12, diff_type: "added" },
      ],
      1000,
    );
    assert.equal(result.length, 2);
  });

  it("does not merge different diff types", () => {
    const result = buildDiffTicks(
      [
        { line: 1, diff_type: "added" },
        { line: 2, diff_type: "modified" },
      ],
      1000,
    );
    assert.equal(result.length, 2);
  });

  it("does not merge ticks far apart", () => {
    const result = buildDiffTicks(
      [
        { line: 1, diff_type: "added" },
        { line: 500, diff_type: "added" },
      ],
      1000,
    );
    assert.equal(result.length, 2);
  });

  it("preserves the first line as the click target for a merged hunk", () => {
    const result = buildDiffTicks(
      [
        { line: 20, diff_type: "modified" },
        { line: 21, diff_type: "modified" },
        { line: 22, diff_type: "modified" },
      ],
      100,
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].line, 20);
    assert.equal(result[0].endLine, 22);
  });
});

describe("tickTop", () => {
  it("returns 0 for fraction 0", () => {
    assert.equal(tickTop(0, 500), 0);
  });

  it("returns trackHeight for fraction 1", () => {
    assert.equal(tickTop(1, 500), 500);
  });

  it("returns proportional value for mid fraction", () => {
    assert.equal(tickTop(0.5, 500), 250);
  });

  it("clamps negative fraction to 0", () => {
    assert.equal(tickTop(-0.1, 500), 0);
  });

  it("clamps fraction above 1 to trackHeight", () => {
    assert.equal(tickTop(1.5, 500), 500);
  });
});

describe("tickHeight", () => {
  it("returns proportional height for multi-line hunk", () => {
    assert.equal(tickHeight(60, 1000, 600, 3), 36);
  });

  it("returns minHeight when proportional height is smaller", () => {
    assert.equal(tickHeight(1, 1000, 600, 3), 3);
  });

  it("returns full trackHeight when hunk spans entire file", () => {
    assert.equal(tickHeight(100, 100, 500, 3), 500);
  });

  it("returns minHeight for totalLines of 0", () => {
    assert.equal(tickHeight(1, 0, 500, 3), 3);
  });
});

// --- Controller tests ---

function mockElement(tag = "div") {
  const children = [];
  const classList = new Set();
  const styles = {};
  const listeners = {};
  return {
    tagName: tag.toUpperCase(),
    className: "",
    children,
    style: new Proxy(styles, {
      set(t, k, v) {
        t[k] = v;
        return true;
      },
      get(t, k) {
        return t[k] ?? "";
      },
    }),
    classList: {
      add(...classes) {
        for (const c of classes) classList.add(c);
      },
      remove(...classes) {
        for (const c of classes) classList.delete(c);
      },
      contains(c) {
        return classList.has(c);
      },
      toggle(c, force) {
        if (force === undefined) {
          classList.has(c) ? classList.delete(c) : classList.add(c);
        } else if (force) {
          classList.add(c);
        } else {
          classList.delete(c);
        }
      },
    },
    _classList: classList,
    setAttribute(name, value) {
      this[`_attr_${name}`] = value;
    },
    getAttribute(name) {
      return this[`_attr_${name}`] ?? null;
    },
    appendChild(child) {
      children.push(child);
    },
    removeChild(child) {
      const i = children.indexOf(child);
      if (i !== -1) children.splice(i, 1);
    },
    remove() {},
    contains(child) {
      return children.includes(child);
    },
    addEventListener(event, fn) {
      listeners[event] = listeners[event] || [];
      listeners[event].push(fn);
    },
    _fire(event, detail) {
      for (const fn of listeners[event] || []) fn(detail);
    },
    querySelector() {
      return null;
    },
    get textContent() {
      return "";
    },
    set textContent(_v) {
      children.length = 0;
    },
  };
}

before(() => {
  globalThis.document = {
    createElement(tag) {
      return mockElement(tag);
    },
  };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
});

const { createDiffMapController } = await import(
  "../../../src/ui/diff/map-controller.js"
);

function makeControllerMocks() {
  const editorState = mockElement();
  const scroller = mockElement();
  scroller.clientHeight = 500;
  const codeEditor = mockElement();
  codeEditor.querySelector = (sel) =>
    sel === ".cm-scroller" ? scroller : null;

  const scrollToLine = mock.fn();
  const codeEditorController = { scrollToLine };

  const el = { editorState, codeEditor };
  return { el, codeEditorController, scrollToLine, scroller };
}

describe("createDiffMapController", () => {
  it("appends diff-map element to editorState", () => {
    const { el, codeEditorController } = makeControllerMocks();
    createDiffMapController({ el, codeEditorController });
    assert.equal(el.editorState.children.length, 1);
    assert.ok(el.editorState.children[0]._classList.has("diff-map"));
  });

  it("starts hidden", () => {
    const { el, codeEditorController } = makeControllerMocks();
    createDiffMapController({ el, codeEditorController });
    assert.ok(el.editorState.children[0]._classList.has("hidden"));
  });

  it("update renders ticks and shows the map", () => {
    const { el, codeEditorController } = makeControllerMocks();
    const ctrl = createDiffMapController({ el, codeEditorController });
    ctrl.update(
      [
        { line: 1, diff_type: "added" },
        { line: 50, diff_type: "added" },
      ],
      100,
    );
    const map = el.editorState.children[0];
    assert.ok(!map._classList.has("hidden"));
    assert.equal(map.children.length, 2);
    assert.ok(map.children[0]._classList.has("diff-map-tick--added"));
  });

  it("update with empty annotations shows no ticks but stays visible", () => {
    const { el, codeEditorController } = makeControllerMocks();
    const ctrl = createDiffMapController({ el, codeEditorController });
    ctrl.update([], 100);
    const map = el.editorState.children[0];
    assert.ok(!map._classList.has("hidden"));
    assert.equal(map.children.length, 0);
  });

  it("hide hides the container", () => {
    const { el, codeEditorController } = makeControllerMocks();
    const ctrl = createDiffMapController({ el, codeEditorController });
    ctrl.update([{ line: 1, diff_type: "added" }], 10);
    ctrl.hide();
    const map = el.editorState.children[0];
    assert.ok(map._classList.has("hidden"));
  });

  it("click on tick calls scrollToLine", () => {
    const { el, codeEditorController, scrollToLine } = makeControllerMocks();
    const ctrl = createDiffMapController({ el, codeEditorController });
    ctrl.update([{ line: 42, diff_type: "added" }], 100);
    const map = el.editorState.children[0];
    const tick = map.children[0];
    // Simulate click event with target having data-line
    map._fire("click", { target: tick });
    assert.equal(scrollToLine.mock.calls.length, 1);
    assert.equal(scrollToLine.mock.calls[0].arguments[0], 42);
  });

  it("click on container without tick does not call scrollToLine", () => {
    const { el, codeEditorController, scrollToLine } = makeControllerMocks();
    const ctrl = createDiffMapController({ el, codeEditorController });
    ctrl.update([{ line: 1, diff_type: "added" }], 10);
    const map = el.editorState.children[0];
    // Click on container itself (no data-line)
    map._fire("click", { target: map });
    assert.equal(scrollToLine.mock.calls.length, 0);
  });

  it("positions ticks proportionally to totalLines", () => {
    const { el, codeEditorController, scroller } = makeControllerMocks();
    scroller.clientHeight = 600;
    const ctrl = createDiffMapController({ el, codeEditorController });
    ctrl.update([{ line: 1, diff_type: "added" }], 100);
    const map = el.editorState.children[0];
    const tick = map.children[0];
    // line 1 of 100: fraction=0/100=0, top=0*600=0
    assert.equal(tick.style.top, "0px");
    // height = max(3, 1/100*600) = max(3, 6) = 6
    assert.equal(tick.style.height, "6px");
  });

  it("destroy removes the element", () => {
    const { el, codeEditorController } = makeControllerMocks();
    const ctrl = createDiffMapController({ el, codeEditorController });
    ctrl.destroy();
    assert.equal(el.editorState.children.length, 0);
  });
});
