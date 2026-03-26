import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildKeyboardShortcuts } from "../../src/ui/keyboard-shortcuts.js";

describe("buildKeyboardShortcuts", () => {
  it("returns an array of shortcut descriptors", () => {
    const shortcuts = buildKeyboardShortcuts({});
    assert.ok(Array.isArray(shortcuts));
    assert.ok(shortcuts.length > 0);
  });

  it("each shortcut has key or code, meta, and handler", () => {
    const shortcuts = buildKeyboardShortcuts({});
    for (const s of shortcuts) {
      assert.ok(
        typeof s.key === "string" || typeof s.code === "string",
        `key/code missing on shortcut`,
      );
      assert.ok(
        typeof s.handler === "function",
        `handler missing for ${s.key || s.code}`,
      );
    }
  });

  it("cmd+f calls openFind", () => {
    let called = false;
    const shortcuts = buildKeyboardShortcuts({
      openFind: () => {
        called = true;
      },
    });
    const entry = shortcuts.find((s) => s.key === "f" && s.meta && !s.shift);
    assert.ok(entry, "cmd+f shortcut should exist");
    entry.handler();
    assert.ok(called);
  });

  it("cmd+s calls saveNow", () => {
    let called = false;
    const shortcuts = buildKeyboardShortcuts({
      saveNow: () => {
        called = true;
      },
    });
    const entry = shortcuts.find((s) => s.key === "s" && s.meta && !s.shift);
    assert.ok(entry, "cmd+s shortcut should exist");
    entry.handler();
    assert.ok(called);
  });

  it("cmd+e calls toggleMarkdownMode", () => {
    let called = false;
    const shortcuts = buildKeyboardShortcuts({
      toggleMarkdownMode: () => {
        called = true;
      },
    });
    const entry = shortcuts.find((s) => s.key === "e" && s.meta && !s.shift);
    assert.ok(entry, "cmd+e shortcut should exist");
    entry.handler();
    assert.ok(called);
  });

  it("cmd+shift+g calls toggleUnifiedDiff", () => {
    let called = false;
    const shortcuts = buildKeyboardShortcuts({
      toggleUnifiedDiff: () => {
        called = true;
      },
    });
    const entry = shortcuts.find((s) => s.key === "g" && s.meta && s.shift);
    assert.ok(entry, "cmd+shift+g shortcut should exist");
    entry.handler();
    assert.ok(called);
  });

  it("cmd+shift+m calls toggleModifiedOnly", () => {
    let called = false;
    const shortcuts = buildKeyboardShortcuts({
      toggleModifiedOnly: () => {
        called = true;
      },
    });
    const entry = shortcuts.find((s) => s.key === "m" && s.meta && s.shift);
    assert.ok(entry, "cmd+shift+m shortcut should exist");
    entry.handler();
    assert.ok(called);
  });

  it("cmd+shift+e calls toggleCollapseAllFolders", () => {
    let called = false;
    const shortcuts = buildKeyboardShortcuts({
      toggleCollapseAllFolders: () => {
        called = true;
      },
    });
    const entry = shortcuts.find((s) => s.key === "e" && s.meta && s.shift);
    assert.ok(entry, "cmd+shift+e shortcut should exist");
    entry.handler();
    assert.ok(called);
  });

  it("cmd+[ calls navigateBack", () => {
    let called = false;
    const shortcuts = buildKeyboardShortcuts({
      navigateBack: () => {
        called = true;
      },
    });
    const entry = shortcuts.find((s) => s.key === "[" && s.meta);
    assert.ok(entry, "cmd+[ shortcut should exist");
    entry.handler();
    assert.ok(called);
  });

  it("cmd+] calls navigateForward", () => {
    let called = false;
    const shortcuts = buildKeyboardShortcuts({
      navigateForward: () => {
        called = true;
      },
    });
    const entry = shortcuts.find((s) => s.key === "]" && s.meta);
    assert.ok(entry, "cmd+] shortcut should exist");
    entry.handler();
    assert.ok(called);
  });

  it("cmd+/ calls toggleStatusBar", () => {
    let called = false;
    const shortcuts = buildKeyboardShortcuts({
      toggleStatusBar: () => {
        called = true;
      },
    });
    const entry = shortcuts.find((s) => s.key === "/" && s.meta);
    assert.ok(entry, "cmd+/ shortcut should exist");
    entry.handler();
    assert.ok(called);
  });

  it("cmd+backslash calls toggleSidebarVisibility", () => {
    let called = false;
    const shortcuts = buildKeyboardShortcuts({
      toggleSidebarVisibility: () => {
        called = true;
      },
    });
    const entry = shortcuts.find((s) => s.code === "Backslash" && s.meta);
    assert.ok(entry, "cmd+backslash shortcut should exist");
    entry.handler();
    assert.ok(called);
  });
});
