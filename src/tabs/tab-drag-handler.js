import { isCursorOutsideWindow } from "../utils/app-utils.js";

export function bindTabDragEvents({ el, moveTab, crossWindowDrag }) {
  let dragState = null;

  function clearDropIndicators() {
    el.tabBar.querySelectorAll(".tab").forEach((t) => {
      t.classList.remove("tab-drag-over-left", "tab-drag-over-right");
    });
  }

  function updateDropIndicator(clientX) {
    clearDropIndicators();
    const tabs = el.tabBar.querySelectorAll(".tab");
    for (const t of tabs) {
      const rect = t.getBoundingClientRect();
      if (clientX >= rect.left && clientX < rect.right) {
        const midX = rect.left + rect.width / 2;
        t.classList.add(
          clientX < midX ? "tab-drag-over-left" : "tab-drag-over-right",
        );
        break;
      }
    }
  }

  function createGhost(sourceEl, clientX) {
    const ghost = sourceEl.cloneNode(true);
    const rect = sourceEl.getBoundingClientRect();
    ghost.className = "tab tab-active tab-ghost";
    ghost.style.width = `${rect.width}px`;
    ghost.style.left = `${clientX - rect.width / 2}px`;
    ghost.style.top = `${rect.top}px`;
    document.body.appendChild(ghost);
    return ghost;
  }

  function finishDrag(clientX) {
    if (!dragState) {
      return;
    }
    const fromIndex = dragState.fromIndex;
    dragState.sourceEl.classList.remove("tab-dragging");
    if (dragState.ghost) {
      dragState.ghost.remove();
    }
    document.documentElement.classList.remove("tab-reordering");
    dragState = null;
    clearDropIndicators();
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);

    const tabs = el.tabBar.querySelectorAll(".tab");
    for (const t of tabs) {
      const rect = t.getBoundingClientRect();
      if (clientX >= rect.left && clientX < rect.right) {
        const toIndex = parseInt(t.dataset.index, 10);
        const midX = rect.left + rect.width / 2;
        let target = clientX < midX ? toIndex : toIndex + 1;
        if (target > fromIndex) {
          target -= 1;
        }
        if (fromIndex !== target) {
          moveTab(fromIndex, target);
        }
        return;
      }
    }
  }

  function onMouseMove(event) {
    if (!dragState) {
      return;
    }
    event.preventDefault();
    if (!dragState.dragging) {
      const dx = event.clientX - dragState.startX;
      if (Math.abs(dx) < 5) {
        return;
      }
      dragState.dragging = true;
      dragState.sourceEl.classList.add("tab-dragging");
      dragState.ghost = createGhost(dragState.sourceEl, event.clientX);
      document.documentElement.classList.add("tab-reordering");
      if (crossWindowDrag) {
        crossWindowDrag.activate(dragState.fromIndex);
      }
    }

    const outside = isCursorOutsideWindow(event.clientX, event.clientY);

    if (outside && crossWindowDrag) {
      clearDropIndicators();
      if (dragState.ghost) {
        dragState.ghost.classList.add("hidden");
      }
      crossWindowDrag.reportPosition(event.screenX, event.screenY);
      return;
    }

    if (!outside && crossWindowDrag) {
      crossWindowDrag.clearPreview();
    }

    if (dragState.ghost) {
      dragState.ghost.classList.remove("hidden");
      const rect = dragState.sourceEl.getBoundingClientRect();
      dragState.ghost.style.left = `${event.clientX - rect.width / 2}px`;
    }
    updateDropIndicator(event.clientX);
  }

  function cleanupDragUi() {
    if (dragState) {
      dragState.sourceEl.classList.remove("tab-dragging");
      if (dragState.ghost) {
        dragState.ghost.remove();
      }
    }
    document.documentElement.classList.remove("tab-reordering");
    dragState = null;
    clearDropIndicators();
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  function onMouseUp(event) {
    if (!dragState) {
      return;
    }
    if (dragState.dragging) {
      if (crossWindowDrag?.currentTargetLabel()) {
        cleanupDragUi();
        crossWindowDrag.completeDrop();
        return;
      }
      if (
        crossWindowDrag &&
        isCursorOutsideWindow(event.clientX, event.clientY)
      ) {
        cleanupDragUi();
        crossWindowDrag.completeDropAsNewWindow(event.screenX, event.screenY);
        return;
      }
      if (crossWindowDrag) {
        crossWindowDrag.cancel();
      }
      finishDrag(event.clientX);
    } else {
      dragState = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
  }

  el.tabBar.querySelectorAll(".tab").forEach((tabEl) => {
    tabEl.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || event.target.closest(".tab-close")) {
        return;
      }
      event.preventDefault();
      dragState = {
        fromIndex: parseInt(tabEl.dataset.index, 10),
        sourceEl: tabEl,
        startX: event.clientX,
        dragging: false,
        ghost: null,
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  });
}
