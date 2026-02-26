import { shouldSuppressDropOverlayForSelfHover } from "../ui/behavior.js";
import { extractDragDropPaths } from "../path-input.js";

export function createDragDropController({
  state,
  listen,
  dropOverlayDragState,
  setDropOverlayVisible,
  handleDroppedPaths,
}) {
  async function bindWindowDragDropEvents() {
    const tauriWindowApi = window.__TAURI__?.window;
    const getCurrentWindow = tauriWindowApi?.getCurrentWindow;

    if (typeof getCurrentWindow === "function") {
      const currentWindow = getCurrentWindow();
      if (typeof currentWindow?.onDragDropEvent === "function") {
        return currentWindow.onDragDropEvent(async (event) => {
          const dragEvent = event?.payload;
          if (!dragEvent || typeof dragEvent.type !== "string") {
            return;
          }

          if (dragEvent.type === "enter") {
            const paths = extractDragDropPaths(dragEvent);
            dropOverlayDragState.suppressOverlay =
              paths.length === 0 ||
              shouldSuppressDropOverlayForSelfHover({
                paths,
                activePath: state.activePath,
                rootPath: state.rootPath,
              });
            if (!dropOverlayDragState.suppressOverlay) {
              setDropOverlayVisible(true);
            }
            return;
          }

          if (dragEvent.type === "over") {
            if (!dropOverlayDragState.suppressOverlay) {
              setDropOverlayVisible(true);
            }
            return;
          }

          if (dragEvent.type === "leave") {
            dropOverlayDragState.suppressOverlay = false;
            setDropOverlayVisible(false);
            return;
          }

          if (dragEvent.type === "drop") {
            const paths = extractDragDropPaths(dragEvent);
            dropOverlayDragState.suppressOverlay = false;
            setDropOverlayVisible(false);
            if (shouldSuppressDropOverlayForSelfHover({
              paths,
              activePath: state.activePath,
              rootPath: state.rootPath,
            })) {
              return;
            }
            await handleDroppedPaths(paths);
          }
        });
      }
    }

    const unlisteners = await Promise.all([
      listen("tauri://drag-enter", (event) => {
        const paths = extractDragDropPaths(event.payload);
        dropOverlayDragState.suppressOverlay =
          paths.length === 0 ||
          shouldSuppressDropOverlayForSelfHover({
            paths,
            activePath: state.activePath,
            rootPath: state.rootPath,
          });
        if (!dropOverlayDragState.suppressOverlay) {
          setDropOverlayVisible(true);
        }
      }),
      listen("tauri://drag-over", () => {
        if (!dropOverlayDragState.suppressOverlay) {
          setDropOverlayVisible(true);
        }
      }),
      listen("tauri://drag-leave", () => {
        dropOverlayDragState.suppressOverlay = false;
        setDropOverlayVisible(false);
      }),
      listen("tauri://drag-drop", async (event) => {
        const paths = extractDragDropPaths(event.payload);
        dropOverlayDragState.suppressOverlay = false;
        setDropOverlayVisible(false);
        if (shouldSuppressDropOverlayForSelfHover({
          paths,
          activePath: state.activePath,
          rootPath: state.rootPath,
        })) {
          return;
        }
        await handleDroppedPaths(paths);
      }),
    ]);

    return () => {
      for (const unlisten of unlisteners) {
        if (typeof unlisten === "function") {
          unlisten();
        }
      }
    };
  }

  return {
    bindWindowDragDropEvents,
  };
}
