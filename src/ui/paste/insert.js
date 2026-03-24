/**
 * Inserts pasted text into a textarea using execCommand('insertText') so the
 * insertion integrates with the native undo stack.
 *
 * When formatting differs from the raw clipboard text, a two-step insertion
 * is performed: first the raw text, then a replacement with the formatted
 * version. A frame break separates the two steps so macOS WebKit treats them
 * as distinct undo entries:
 *   Cmd+Z  → raw (unformatted) text
 *   Cmd+Z  → pre-paste state
 *
 * @param {HTMLTextAreaElement} editor
 * @param {string} rawText - original clipboard text
 * @param {string|null} formattedText - formatted version, or null if unchanged
 * @returns {Promise<{ inserted: "raw" | "formatted" }>}
 */
export async function insertFormattedPaste(editor, rawText, formattedText) {
  const hasFormatting = formattedText && formattedText !== rawText;

  editor.focus();

  if (!hasFormatting) {
    document.execCommand("insertText", false, rawText);
    return { inserted: "raw" };
  }

  const insertStart = editor.selectionStart;

  // Step 1: insert the raw text (undo step 1)
  document.execCommand("insertText", false, rawText);

  // Yield a frame so WebKit closes the current undo group
  await new Promise((resolve) => requestAnimationFrame(resolve));

  // Step 2: select the just-inserted raw text, then replace with formatted
  editor.focus();
  editor.setSelectionRange(insertStart, insertStart + rawText.length);
  document.execCommand("insertText", false, formattedText);

  return { inserted: "formatted" };
}
