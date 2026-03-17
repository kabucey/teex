import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { insertFormattedPaste } from "../../src/ui/paste-insert.js";

let execCommandCalls;

// Stub requestAnimationFrame for Node (used by the async frame break)
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);

function createMockEditor(initialValue = "", selectionStart = 0) {
  const editor = {
    value: initialValue,
    selectionStart,
    selectionEnd: selectionStart,
    focused: false,
    focus() {
      this.focused = true;
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
  };
  return editor;
}

function createUndoableEditor(initialValue = "") {
  const undoStack = [];
  const redoStack = [];
  const editor = {
    value: initialValue,
    selectionStart: initialValue.length,
    selectionEnd: initialValue.length,
    focused: false,
    focus() {
      this.focused = true;
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
  };

  globalThis.document = {
    execCommand(command, _showUI, text) {
      if (command !== "insertText") return false;
      const before = editor.value.slice(0, editor.selectionStart);
      const after = editor.value.slice(editor.selectionEnd);
      undoStack.push({
        value: editor.value,
        selectionStart: editor.selectionStart,
        selectionEnd: editor.selectionEnd,
      });
      redoStack.length = 0;
      editor.value = before + text + after;
      const cursor = before.length + text.length;
      editor.selectionStart = cursor;
      editor.selectionEnd = cursor;
      return true;
    },
  };

  function undo() {
    if (undoStack.length === 0) return false;
    const snapshot = undoStack.pop();
    redoStack.push({
      value: editor.value,
      selectionStart: editor.selectionStart,
      selectionEnd: editor.selectionEnd,
    });
    editor.value = snapshot.value;
    editor.selectionStart = snapshot.selectionStart;
    editor.selectionEnd = snapshot.selectionEnd;
    return true;
  }

  function redo() {
    if (redoStack.length === 0) return false;
    const snapshot = redoStack.pop();
    undoStack.push({
      value: editor.value,
      selectionStart: editor.selectionStart,
      selectionEnd: editor.selectionEnd,
    });
    editor.value = snapshot.value;
    editor.selectionStart = snapshot.selectionStart;
    editor.selectionEnd = snapshot.selectionEnd;
    return true;
  }

  return { editor, undo, redo };
}

beforeEach(() => {
  execCommandCalls = [];
  globalThis.document = {
    execCommand(command, showUI, value) {
      execCommandCalls.push({ command, showUI, value });
      return true;
    },
  };
});

describe("insertFormattedPaste", () => {
  it("inserts raw text when formattedText is null", async () => {
    const editor = createMockEditor();
    const result = await insertFormattedPaste(editor, "hello", null);

    assert.equal(result.inserted, "raw");
    assert.equal(execCommandCalls.length, 1);
    assert.equal(execCommandCalls[0].value, "hello");
    assert.equal(editor.focused, true);
  });

  it("inserts raw text when formattedText equals rawText", async () => {
    const editor = createMockEditor();
    const result = await insertFormattedPaste(editor, "same", "same");

    assert.equal(result.inserted, "raw");
    assert.equal(execCommandCalls.length, 1);
    assert.equal(execCommandCalls[0].value, "same");
  });

  it("performs two-step insert when formattedText differs", async () => {
    const editor = createMockEditor();
    const raw = '{"a":1}';
    const formatted = '{\n  "a": 1\n}';

    const result = await insertFormattedPaste(editor, raw, formatted);

    assert.equal(result.inserted, "formatted");
    assert.equal(execCommandCalls.length, 2);
    assert.equal(execCommandCalls[0].value, raw);
    assert.equal(execCommandCalls[1].value, formatted);
  });

  it("uses insertText command for all insertions", async () => {
    const editor = createMockEditor();
    await insertFormattedPaste(editor, "text", '{\n  "text"\n}');

    for (const call of execCommandCalls) {
      assert.equal(call.command, "insertText");
      assert.equal(call.showUI, false);
    }
  });

  it("focuses the editor before inserting", async () => {
    const editor = createMockEditor();
    let focusedBeforeExec = false;

    editor.focus = function () {
      this.focused = true;
    };

    globalThis.document = {
      execCommand() {
        focusedBeforeExec = editor.focused;
        return true;
      },
    };

    await insertFormattedPaste(editor, "hello", null);
    assert.equal(focusedBeforeExec, true);
  });

  it("returns raw when formattedText is empty string", async () => {
    const editor = createMockEditor();
    const result = await insertFormattedPaste(editor, "hello", "");

    assert.equal(result.inserted, "raw");
    assert.equal(execCommandCalls.length, 1);
    assert.equal(execCommandCalls[0].value, "hello");
  });
});

describe("JSON paste undo scenario", () => {
  it("paste unformatted JSON, undo to raw, undo to blank", async () => {
    const { editor, undo } = createUndoableEditor("");
    const raw = '{"name":"Alice","age":30}';
    const formatted = '{\n  "name": "Alice",\n  "age": 30\n}';

    await insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, formatted);

    undo();
    assert.equal(editor.value, raw);

    undo();
    assert.equal(editor.value, "");
  });

  it("paste JSON, undo to raw, redo back to formatted", async () => {
    const { editor, undo, redo } = createUndoableEditor("");
    const raw = '{"x":1}';
    const formatted = '{\n  "x": 1\n}';

    await insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, formatted);

    undo();
    assert.equal(editor.value, raw);

    redo();
    assert.equal(editor.value, formatted);
  });

  it("paste JSON, full undo to blank, full redo back to formatted", async () => {
    const { editor, undo, redo } = createUndoableEditor("");
    const raw = '{"x":1}';
    const formatted = '{\n  "x": 1\n}';

    await insertFormattedPaste(editor, raw, formatted);

    undo();
    undo();
    assert.equal(editor.value, "");

    redo();
    assert.equal(editor.value, raw);

    redo();
    assert.equal(editor.value, formatted);
  });

  it("type, paste formatted JSON, undo each step", async () => {
    const { editor, undo } = createUndoableEditor("");
    const raw = '{"key":"val"}';
    const formatted = '{\n  "key": "val"\n}';

    document.execCommand("insertText", false, "hello ");
    assert.equal(editor.value, "hello ");

    await insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, `hello ${formatted}`);

    undo();
    assert.equal(editor.value, `hello ${raw}`);

    undo();
    assert.equal(editor.value, "hello ");

    undo();
    assert.equal(editor.value, "");
  });

  it("raw-only paste produces single undo step", async () => {
    const { editor, undo } = createUndoableEditor("");
    const raw = "plain text";

    await insertFormattedPaste(editor, raw, null);
    assert.equal(editor.value, "plain text");

    undo();
    assert.equal(editor.value, "");

    const didUndo = undo();
    assert.equal(didUndo, false);
    assert.equal(editor.value, "");
  });

  it("paste into middle of existing text, undo restores original", async () => {
    const { editor, undo } = createUndoableEditor("abcdef");
    editor.selectionStart = 3;
    editor.selectionEnd = 3;

    const raw = '{"z":9}';
    const formatted = '{\n  "z": 9\n}';

    await insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, `abc${formatted}def`);

    undo();
    assert.equal(editor.value, `abc${raw}def`);

    undo();
    assert.equal(editor.value, "abcdef");
  });

  it("paste replacing a selection, undo restores selected text", async () => {
    const { editor, undo } = createUndoableEditor("abcdef");
    editor.selectionStart = 1;
    editor.selectionEnd = 4;

    const raw = '{"z":9}';
    const formatted = '{\n  "z": 9\n}';

    await insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, `a${formatted}ef`);

    undo();
    assert.equal(editor.value, `a${raw}ef`);

    undo();
    assert.equal(editor.value, "abcdef");
  });
});

describe("YAML paste undo scenario", () => {
  it("paste unformatted YAML, undo to raw, undo to blank", async () => {
    const { editor, undo } = createUndoableEditor("");
    const raw = "{name: Alice, age: 30}";
    const formatted = "name: Alice\nage: 30\n";

    await insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, formatted);

    undo();
    assert.equal(editor.value, raw);

    undo();
    assert.equal(editor.value, "");
  });

  it("paste YAML, undo to raw, redo back to formatted", async () => {
    const { editor, undo, redo } = createUndoableEditor("");
    const raw = "{host: localhost, port: 8080}";
    const formatted = "host: localhost\nport: 8080\n";

    await insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, formatted);

    undo();
    assert.equal(editor.value, raw);

    redo();
    assert.equal(editor.value, formatted);
  });

  it("paste YAML, full undo to blank, full redo back to formatted", async () => {
    const { editor, undo, redo } = createUndoableEditor("");
    const raw = "{x: 1, y: 2}";
    const formatted = "x: 1\ny: 2\n";

    await insertFormattedPaste(editor, raw, formatted);

    undo();
    undo();
    assert.equal(editor.value, "");

    redo();
    assert.equal(editor.value, raw);

    redo();
    assert.equal(editor.value, formatted);
  });

  it("type, paste formatted YAML, undo each step", async () => {
    const { editor, undo } = createUndoableEditor("");
    const raw = "{db: postgres, port: 5432}";
    const formatted = "db: postgres\nport: 5432\n";

    document.execCommand("insertText", false, "# config\n");
    assert.equal(editor.value, "# config\n");

    await insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, `# config\n${formatted}`);

    undo();
    assert.equal(editor.value, `# config\n${raw}`);

    undo();
    assert.equal(editor.value, "# config\n");

    undo();
    assert.equal(editor.value, "");
  });
});

describe("TOML paste undo scenario", () => {
  it("paste unformatted TOML, undo to raw, undo to blank", async () => {
    const { editor, undo } = createUndoableEditor("");
    const raw = 'name="teex"\nversion="0.1.0"';
    const formatted = 'name = "teex"\nversion = "0.1.0"';

    await insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, formatted);

    undo();
    assert.equal(editor.value, raw);

    undo();
    assert.equal(editor.value, "");
  });

  it("paste TOML, undo to raw, redo back to formatted", async () => {
    const { editor, undo, redo } = createUndoableEditor("");
    const raw = 'name="teex"';
    const formatted = 'name = "teex"';

    await insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, formatted);

    undo();
    assert.equal(editor.value, raw);

    redo();
    assert.equal(editor.value, formatted);
  });

  it("paste TOML, full undo to blank, full redo back to formatted", async () => {
    const { editor, undo, redo } = createUndoableEditor("");
    const raw = "port=8080";
    const formatted = "port = 8080";

    await insertFormattedPaste(editor, raw, formatted);

    undo();
    undo();
    assert.equal(editor.value, "");

    redo();
    assert.equal(editor.value, raw);

    redo();
    assert.equal(editor.value, formatted);
  });
});

describe("XML paste undo scenario", () => {
  it("paste unformatted XML, undo to raw, undo to blank", async () => {
    const { editor, undo } = createUndoableEditor("");
    const raw = "<root><child>text</child></root>";
    const formatted = "<root>\n  <child>text</child>\n</root>";

    await insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, formatted);

    undo();
    assert.equal(editor.value, raw);

    undo();
    assert.equal(editor.value, "");
  });

  it("paste XML, undo to raw, redo back to formatted", async () => {
    const { editor, undo, redo } = createUndoableEditor("");
    const raw = "<a><b/></a>";
    const formatted = "<a>\n  <b/>\n</a>";

    await insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, formatted);

    undo();
    assert.equal(editor.value, raw);

    redo();
    assert.equal(editor.value, formatted);
  });

  it("paste XML, full undo to blank, full redo back to formatted", async () => {
    const { editor, undo, redo } = createUndoableEditor("");
    const raw = "<x><y>1</y></x>";
    const formatted = "<x>\n  <y>1</y>\n</x>";

    await insertFormattedPaste(editor, raw, formatted);

    undo();
    undo();
    assert.equal(editor.value, "");

    redo();
    assert.equal(editor.value, raw);

    redo();
    assert.equal(editor.value, formatted);
  });
});

describe("CSV paste undo scenario", () => {
  it("paste unaligned CSV, undo to raw, undo to blank", async () => {
    const { editor, undo } = createUndoableEditor("");
    const raw = "name,age,city\nAlice,30,NYC";
    const formatted = "name ,age,city\nAlice,30 ,NYC";

    await insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, formatted);

    undo();
    assert.equal(editor.value, raw);

    undo();
    assert.equal(editor.value, "");
  });

  it("paste CSV, undo to raw, redo back to formatted", async () => {
    const { editor, undo } = createUndoableEditor("");
    const raw = "a,b\n1,2";
    const formatted = "a,b\n1,2";

    await insertFormattedPaste(editor, raw, formatted);
    // Same content → single-step raw insert
    assert.equal(editor.value, raw);

    undo();
    assert.equal(editor.value, "");
  });

  it("paste CSV, full undo to blank, full redo back to formatted", async () => {
    const { editor, undo, redo } = createUndoableEditor("");
    const raw = "x,yy\n111,2";
    const formatted = "x  ,yy\n111,2";

    await insertFormattedPaste(editor, raw, formatted);

    undo();
    undo();
    assert.equal(editor.value, "");

    redo();
    assert.equal(editor.value, raw);

    redo();
    assert.equal(editor.value, formatted);
  });
});
