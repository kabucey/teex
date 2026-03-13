/**
 * Inserts pasted text into a textarea, with two-step undo support for
 * formatting. Instead of relying on the browser's undo stack (which
 * merges execCommand entries in WebKit), we manage undo state ourselves.
 *
 * Returns an undoState object when formatting was applied, which the
 * caller stores and passes to undoPasteFormatting on Cmd+Z.
 *
 * @param {HTMLTextAreaElement} editor
 * @param {string} rawText - original clipboard text
 * @param {string|null} formattedText - formatted version, or null if unchanged
 * @returns {{ inserted: "raw" | "formatted", undoState: object|null }}
 */
export function insertWithFormattingUndo(editor, rawText, formattedText) {
  const prePasteValue = editor.value;
  const selStart = editor.selectionStart;
  const selEnd = editor.selectionEnd;

  const before = prePasteValue.slice(0, selStart);
  const after = prePasteValue.slice(selEnd);

  const hasFormatting = formattedText && formattedText !== rawText;
  const insertText = hasFormatting ? formattedText : rawText;

  editor.value = before + insertText + after;
  const cursor = before.length + insertText.length;
  editor.selectionStart = cursor;
  editor.selectionEnd = cursor;

  if (!hasFormatting) {
    return { inserted: "raw", undoState: null };
  }

  const rawCursor = before.length + rawText.length;
  return {
    inserted: "formatted",
    undoState: {
      phase: "formatted",
      prePaste: { value: prePasteValue, selStart, selEnd },
      rawPaste: {
        value: before + rawText + after,
        selStart: rawCursor,
        selEnd: rawCursor,
      },
    },
  };
}

/**
 * Performs one step of paste-formatting undo.
 * - phase "formatted" → restores raw text (returns updated state with phase "raw")
 * - phase "raw" → restores pre-paste text (returns null, undo complete)
 *
 * @param {HTMLTextAreaElement} editor
 * @param {object} undoState - current undo state from insertWithFormattingUndo
 * @returns {object|null} updated undo state, or null if undo is complete
 */
export function undoPasteFormatting(editor, undoState) {
  if (!undoState) return null;

  if (undoState.phase === "formatted") {
    const { value, selStart, selEnd } = undoState.rawPaste;
    editor.value = value;
    editor.selectionStart = selStart;
    editor.selectionEnd = selEnd;
    return { ...undoState, phase: "raw" };
  }

  if (undoState.phase === "raw") {
    const { value, selStart, selEnd } = undoState.prePaste;
    editor.value = value;
    editor.selectionStart = selStart;
    editor.selectionEnd = selEnd;
    return null;
  }

  return null;
}
