import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { insertFormattedPaste } from "../../src/ui/paste-insert.js";

let execCommandCalls;

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
  it("inserts raw text when formattedText is null", () => {
    const editor = createMockEditor();
    const result = insertFormattedPaste(editor, "hello", null);

    assert.equal(result.inserted, "raw");
    assert.equal(execCommandCalls.length, 1);
    assert.equal(execCommandCalls[0].value, "hello");
    assert.equal(editor.focused, true);
  });

  it("inserts raw text when formattedText equals rawText", () => {
    const editor = createMockEditor();
    const result = insertFormattedPaste(editor, "same", "same");

    assert.equal(result.inserted, "raw");
    assert.equal(execCommandCalls.length, 1);
    assert.equal(execCommandCalls[0].value, "same");
  });

  it("performs two-step insert when formattedText differs", () => {
    const editor = createMockEditor();
    const raw = '{"a":1}';
    const formatted = '{\n  "a": 1\n}';

    const result = insertFormattedPaste(editor, raw, formatted);

    assert.equal(result.inserted, "formatted");
    assert.equal(execCommandCalls.length, 2);
    assert.equal(execCommandCalls[0].value, raw);
    assert.equal(execCommandCalls[1].value, formatted);
  });

  it("selects raw text before replacing with formatted", () => {
    const editor = createMockEditor("prefix", 6);
    const raw = '{"a":1}';
    const formatted = '{\n  "a": 1\n}';

    insertFormattedPaste(editor, raw, formatted);

    // After step 1 (insertText with raw), selection should be set to
    // cover the raw text before step 2
    assert.equal(editor.selectionStart, 6);
    assert.equal(editor.selectionEnd, 6 + raw.length);
  });

  it("uses insertText command for all insertions", () => {
    const editor = createMockEditor();
    insertFormattedPaste(editor, "text", '{\n  "text"\n}');

    for (const call of execCommandCalls) {
      assert.equal(call.command, "insertText");
      assert.equal(call.showUI, false);
    }
  });

  it("focuses the editor before inserting", () => {
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

    insertFormattedPaste(editor, "hello", null);
    assert.equal(focusedBeforeExec, true);
  });

  it("selects from cursor position zero when editor is empty", () => {
    const editor = createMockEditor("", 0);
    const raw = '{"a":1}';
    const formatted = '{\n  "a": 1\n}';

    insertFormattedPaste(editor, raw, formatted);

    assert.equal(editor.selectionStart, 0);
    assert.equal(editor.selectionEnd, raw.length);
  });

  it("returns raw when formattedText is empty string", () => {
    const editor = createMockEditor();
    const result = insertFormattedPaste(editor, "hello", "");

    assert.equal(result.inserted, "raw");
    assert.equal(execCommandCalls.length, 1);
    assert.equal(execCommandCalls[0].value, "hello");
  });
});

describe("JSON paste undo scenario", () => {
  it("paste unformatted JSON, undo to raw, undo to blank", () => {
    const { editor, undo } = createUndoableEditor("");
    const raw = '{"name":"Alice","age":30}';
    const formatted = '{\n  "name": "Alice",\n  "age": 30\n}';

    insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, formatted);

    // First undo: back to raw (unformatted) JSON
    undo();
    assert.equal(editor.value, raw);

    // Second undo: back to blank
    undo();
    assert.equal(editor.value, "");
  });

  it("paste JSON, undo to raw, redo back to formatted", () => {
    const { editor, undo, redo } = createUndoableEditor("");
    const raw = '{"x":1}';
    const formatted = '{\n  "x": 1\n}';

    insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, formatted);

    undo();
    assert.equal(editor.value, raw);

    redo();
    assert.equal(editor.value, formatted);
  });

  it("paste JSON, full undo to blank, full redo back to formatted", () => {
    const { editor, undo, redo } = createUndoableEditor("");
    const raw = '{"x":1}';
    const formatted = '{\n  "x": 1\n}';

    insertFormattedPaste(editor, raw, formatted);

    undo();
    undo();
    assert.equal(editor.value, "");

    redo();
    assert.equal(editor.value, raw);

    redo();
    assert.equal(editor.value, formatted);
  });

  it("type, paste formatted JSON, undo each step", () => {
    const { editor, undo } = createUndoableEditor("");
    const raw = '{"key":"val"}';
    const formatted = '{\n  "key": "val"\n}';

    // Simulate typing "hello " by inserting via execCommand
    document.execCommand("insertText", false, "hello ");
    assert.equal(editor.value, "hello ");

    insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, `hello ${formatted}`);

    // Undo formatting → raw
    undo();
    assert.equal(editor.value, `hello ${raw}`);

    // Undo paste → just "hello "
    undo();
    assert.equal(editor.value, "hello ");

    // Undo typing → blank
    undo();
    assert.equal(editor.value, "");
  });

  it("raw-only paste produces single undo step", () => {
    const { editor, undo } = createUndoableEditor("");
    const raw = "plain text";

    insertFormattedPaste(editor, raw, null);
    assert.equal(editor.value, "plain text");

    undo();
    assert.equal(editor.value, "");

    // No more undo steps
    const didUndo = undo();
    assert.equal(didUndo, false);
    assert.equal(editor.value, "");
  });

  it("paste into middle of existing text, undo restores original", () => {
    const { editor, undo } = createUndoableEditor("abcdef");
    editor.selectionStart = 3;
    editor.selectionEnd = 3;

    const raw = '{"z":9}';
    const formatted = '{\n  "z": 9\n}';

    insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, `abc${formatted}def`);

    undo();
    assert.equal(editor.value, `abc${raw}def`);

    undo();
    assert.equal(editor.value, "abcdef");
  });

  it("paste replacing a selection, undo restores selected text", () => {
    const { editor, undo } = createUndoableEditor("abcdef");
    editor.selectionStart = 1;
    editor.selectionEnd = 4;

    const raw = '{"z":9}';
    const formatted = '{\n  "z": 9\n}';

    insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, `a${formatted}ef`);

    undo();
    assert.equal(editor.value, `a${raw}ef`);

    undo();
    assert.equal(editor.value, "abcdef");
  });
});

describe("YAML paste undo scenario", () => {
  it("paste unformatted YAML, undo to raw, undo to blank", () => {
    const { editor, undo } = createUndoableEditor("");
    const raw = "{name: Alice, age: 30}";
    const formatted = "name: Alice\nage: 30\n";

    insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, formatted);

    // First undo: back to raw (unformatted) YAML
    undo();
    assert.equal(editor.value, raw);

    // Second undo: back to blank
    undo();
    assert.equal(editor.value, "");
  });

  it("paste YAML, undo to raw, redo back to formatted", () => {
    const { editor, undo, redo } = createUndoableEditor("");
    const raw = "{host: localhost, port: 8080}";
    const formatted = "host: localhost\nport: 8080\n";

    insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, formatted);

    undo();
    assert.equal(editor.value, raw);

    redo();
    assert.equal(editor.value, formatted);
  });

  it("paste YAML, full undo to blank, full redo back to formatted", () => {
    const { editor, undo, redo } = createUndoableEditor("");
    const raw = "{x: 1, y: 2}";
    const formatted = "x: 1\ny: 2\n";

    insertFormattedPaste(editor, raw, formatted);

    undo();
    undo();
    assert.equal(editor.value, "");

    redo();
    assert.equal(editor.value, raw);

    redo();
    assert.equal(editor.value, formatted);
  });

  it("type, paste formatted YAML, undo each step", () => {
    const { editor, undo } = createUndoableEditor("");
    const raw = "{db: postgres, port: 5432}";
    const formatted = "db: postgres\nport: 5432\n";

    document.execCommand("insertText", false, "# config\n");
    assert.equal(editor.value, "# config\n");

    insertFormattedPaste(editor, raw, formatted);
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
  it("paste unformatted TOML, undo to raw, undo to blank", () => {
    const { editor, undo } = createUndoableEditor("");
    const raw = 'name="teex"\nversion="0.1.0"';
    const formatted = 'name = "teex"\nversion = "0.1.0"';

    insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, formatted);

    undo();
    assert.equal(editor.value, raw);

    undo();
    assert.equal(editor.value, "");
  });

  it("paste TOML, undo to raw, redo back to formatted", () => {
    const { editor, undo, redo } = createUndoableEditor("");
    const raw = 'name="teex"';
    const formatted = 'name = "teex"';

    insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, formatted);

    undo();
    assert.equal(editor.value, raw);

    redo();
    assert.equal(editor.value, formatted);
  });

  it("paste TOML, full undo to blank, full redo back to formatted", () => {
    const { editor, undo, redo } = createUndoableEditor("");
    const raw = "port=8080";
    const formatted = "port = 8080";

    insertFormattedPaste(editor, raw, formatted);

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
  it("paste unformatted XML, undo to raw, undo to blank", () => {
    const { editor, undo } = createUndoableEditor("");
    const raw = "<root><child>text</child></root>";
    const formatted = "<root>\n  <child>text</child>\n</root>";

    insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, formatted);

    undo();
    assert.equal(editor.value, raw);

    undo();
    assert.equal(editor.value, "");
  });

  it("paste XML, undo to raw, redo back to formatted", () => {
    const { editor, undo, redo } = createUndoableEditor("");
    const raw = "<a><b/></a>";
    const formatted = "<a>\n  <b/>\n</a>";

    insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, formatted);

    undo();
    assert.equal(editor.value, raw);

    redo();
    assert.equal(editor.value, formatted);
  });

  it("paste XML, full undo to blank, full redo back to formatted", () => {
    const { editor, undo, redo } = createUndoableEditor("");
    const raw = "<x><y>1</y></x>";
    const formatted = "<x>\n  <y>1</y>\n</x>";

    insertFormattedPaste(editor, raw, formatted);

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
  it("paste unaligned CSV, undo to raw, undo to blank", () => {
    const { editor, undo } = createUndoableEditor("");
    const raw = "name,age,city\nAlice,30,NYC";
    const formatted = "name ,age,city\nAlice,30 ,NYC";

    insertFormattedPaste(editor, raw, formatted);
    assert.equal(editor.value, formatted);

    undo();
    assert.equal(editor.value, raw);

    undo();
    assert.equal(editor.value, "");
  });

  it("paste CSV, undo to raw, redo back to formatted", () => {
    const { editor, undo } = createUndoableEditor("");
    const raw = "a,b\n1,2";
    const formatted = "a,b\n1,2";

    insertFormattedPaste(editor, raw, formatted);
    // Same content → single-step raw insert
    assert.equal(editor.value, raw);

    undo();
    assert.equal(editor.value, "");
  });

  it("paste CSV, full undo to blank, full redo back to formatted", () => {
    const { editor, undo, redo } = createUndoableEditor("");
    const raw = "x,yy\n111,2";
    const formatted = "x  ,yy\n111,2";

    insertFormattedPaste(editor, raw, formatted);

    undo();
    undo();
    assert.equal(editor.value, "");

    redo();
    assert.equal(editor.value, raw);

    redo();
    assert.equal(editor.value, formatted);
  });
});
