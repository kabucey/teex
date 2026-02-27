function buildButton(label, value, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.value = value;
  button.textContent = label;
  button.className = className;
  return button;
}

export function promptToSaveBeforeClose(label) {
  const dialog = document.createElement("dialog");
  dialog.className = "close-dirty-dialog";
  dialog.setAttribute("aria-label", "Unsaved changes");

  const body = document.createElement("div");
  body.className = "close-dirty-dialog-body";

  const title = document.createElement("h3");
  title.textContent = `Save changes to "${label}"?`;

  const message = document.createElement("p");
  message.textContent = "Your changes will be lost if you do not save.";

  const actions = document.createElement("div");
  actions.className = "close-dirty-dialog-actions";

  const cancelButton = buildButton("Cancel", "cancel", "close-dirty-btn");
  const discardButton = buildButton("Don't Save", "discard", "close-dirty-btn");
  const saveButton = buildButton("Save", "save", "close-dirty-btn close-dirty-btn-primary");

  actions.append(cancelButton, discardButton, saveButton);
  body.append(title, message, actions);
  dialog.append(body);
  document.body.appendChild(dialog);

  return new Promise((resolve) => {
    let settled = false;

    function finish(value) {
      if (settled) {
        return;
      }
      settled = true;
      try {
        dialog.close();
      } catch {
        // no-op: dialog may already be closed.
      }
      dialog.remove();
      resolve(value);
    }

    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      finish("cancel");
    });

    actions.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-value]");
      if (!button) {
        return;
      }
      finish(button.dataset.value);
    });

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
      saveButton.focus();
      return;
    }

    // Fallback for environments without <dialog>.
    const shouldSave = window.confirm(`Save changes to "${label}"?`);
    if (shouldSave) {
      finish("save");
      return;
    }
    const shouldDiscard = window.confirm(`Don't save changes to "${label}"?`);
    finish(shouldDiscard ? "discard" : "cancel");
  });
}
