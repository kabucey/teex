export const TOAST_DURATION_MS = 2500;

let toastEl = null;
let hideTimer = null;

export function createToastElement() {
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("aria-live", "polite");
  return el;
}

function ensureToast() {
  if (!toastEl) {
    toastEl = createToastElement();
    document.querySelector(".app-shell").appendChild(toastEl);
  }
  return toastEl;
}

export function showToast(message) {
  const el = ensureToast();
  el.textContent = message;

  if (hideTimer) {
    clearTimeout(hideTimer);
  }

  requestAnimationFrame(() => {
    el.classList.add("toast-visible");
  });

  hideTimer = setTimeout(() => {
    el.classList.remove("toast-visible");
    hideTimer = null;
  }, TOAST_DURATION_MS);
}
