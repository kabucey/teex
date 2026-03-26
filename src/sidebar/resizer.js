import { saveSidebarWidth } from "../app/sidebar-width-persistence.js";
import { clamp } from "../utils/app-utils.js";

export function bindSidebarResizer({ el, state }) {
  el.sidebarResizer.addEventListener("pointerdown", (event) => {
    if (state.mode !== "folder" || !state.sidebarVisible) {
      return;
    }

    event.preventDefault();
    const workspaceRect = el.workspace.getBoundingClientRect();

    const onMove = (moveEvent) => {
      const rawWidth = moveEvent.clientX - workspaceRect.left;
      const maxWidth = Math.max(220, Math.floor(workspaceRect.width * 0.65));
      state.sidebarWidth = clamp(rawWidth, 180, maxWidth);
      el.workspace.style.setProperty(
        "--sidebar-width",
        `${state.sidebarWidth}px`,
      );
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      saveSidebarWidth(state.sidebarWidth);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
}
