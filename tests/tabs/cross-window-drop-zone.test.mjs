import assert from "node:assert/strict";
import test from "node:test";

import { createCrossWindowDropZone } from "../../src/tabs/cross-window-drop-zone.js";

function createHarness(stateOverrides = {}) {
  const labelEl = { textContent: "Untitled" };
  const state = {
    openFiles: [
      {
        path: null,
        isDirty: false,
        content: "",
      },
    ],
    ...stateOverrides,
  };
  const el = {
    tabBarRow: {
      classList: {
        classes: new Set(["hidden"]),
        add(value) {
          this.classes.add(value);
        },
        remove(value) {
          this.classes.delete(value);
        },
      },
    },
    tabBar: {
      classList: {
        classes: new Set(),
        add(value) {
          this.classes.add(value);
        },
        remove(value) {
          this.classes.delete(value);
        },
      },
      querySelector(selector) {
        return selector === ".tab-label" ? labelEl : null;
      },
    },
  };

  return {
    controller: createCrossWindowDropZone({ state, el }),
    el,
    labelEl,
  };
}

test("showDropZone swaps untitled label for incoming tab name", () => {
  const harness = createHarness();

  harness.controller.showDropZone("readme.md");
  assert.equal(harness.labelEl.textContent, "readme.md");
  assert.ok(harness.el.tabBar.classList.classes.has("tab-bar-drop-target"));

  harness.controller.hideDropZone();
  assert.equal(harness.labelEl.textContent, "Untitled");
});

test("showDropZone preserves label when untitled tab already has content", () => {
  const harness = createHarness({
    openFiles: [{ path: null, isDirty: true, content: "draft" }],
  });

  harness.controller.showDropZone("readme.md");
  assert.equal(harness.labelEl.textContent, "Untitled");
});
