import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

// Minimal DOM mock for createElement
before(() => {
  globalThis.document = {
    createElement(tag) {
      const classList = new Set();
      return {
        tagName: tag.toUpperCase(),
        className: "",
        textContent: "",
        classList: {
          add(c) {
            classList.add(c);
          },
          remove(c) {
            classList.delete(c);
          },
          contains(c) {
            return classList.has(c);
          },
        },
        setAttribute(name, value) {
          this[`_attr_${name}`] = value;
        },
        getAttribute(name) {
          return this[`_attr_${name}`] ?? null;
        },
      };
    },
  };
});

const { createToastElement, TOAST_DURATION_MS } = await import(
  "../../src/ui/toast.js"
);

describe("toast", () => {
  it("createToastElement returns a div with toast class", () => {
    const el = createToastElement();
    assert.equal(el.tagName, "DIV");
    assert.equal(el.className, "toast");
  });

  it("createToastElement has aria-live polite for accessibility", () => {
    const el = createToastElement();
    assert.equal(el.getAttribute("aria-live"), "polite");
  });

  it("TOAST_DURATION_MS is a positive number", () => {
    assert.equal(typeof TOAST_DURATION_MS, "number");
    assert.ok(TOAST_DURATION_MS > 0);
  });
});
