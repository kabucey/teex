function truncateText(value, max = 120) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function createScrollDebugReporter({ state }) {
  let debugOverlayEl = null;
  let debugEnabled = false;
  let lastToggleDecision = null;

  function renderOverlay() {
    if (!debugEnabled) {
      if (debugOverlayEl?.isConnected) {
        debugOverlayEl.remove();
      }
      return;
    }
    if (typeof document === "undefined") {
      return;
    }
    if (!debugOverlayEl?.isConnected) {
      const pre = document.createElement("pre");
      pre.id = "teex-scroll-debug-overlay";
      Object.assign(pre.style, {
        position: "fixed",
        right: "12px",
        bottom: "12px",
        zIndex: "9999",
        maxWidth: "min(560px, calc(100vw - 24px))",
        maxHeight: "40vh",
        overflow: "auto",
        margin: "0",
        padding: "10px 12px",
        background: "rgba(10, 12, 16, 0.92)",
        color: "#d7e3f4",
        border: "1px solid rgba(170, 190, 210, 0.35)",
        borderRadius: "8px",
        font: "12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
        whiteSpace: "pre-wrap",
        pointerEvents: "none",
      });
      document.body.appendChild(pre);
      debugOverlayEl = pre;
    }

    debugOverlayEl.textContent = JSON.stringify(
      {
        activePath: state.activePath,
        markdownViewMode: state.markdownViewMode,
        lastToggleDecision,
      },
      null,
      2,
    );
  }

  function setEnabled(enabled) {
    debugEnabled = Boolean(enabled);
    try {
      window.localStorage?.setItem("teex:scroll-debug", debugEnabled ? "1" : "0");
    } catch {}
    renderOverlay();
    console.info(`[teex scroll debug] ${debugEnabled ? "enabled" : "disabled"}`);
  }

  function installApi() {
    if (typeof window === "undefined") {
      return;
    }
    try {
      debugEnabled = window.localStorage?.getItem("teex:scroll-debug") === "1";
    } catch {
      debugEnabled = false;
    }

    window.__teexScrollDebug = {
      enable() {
        setEnabled(true);
      },
      disable() {
        setEnabled(false);
      },
      toggle() {
        setEnabled(!debugEnabled);
      },
      get enabled() {
        return debugEnabled;
      },
      getLastDecision() {
        return lastToggleDecision;
      },
      refresh() {
        renderOverlay();
      },
    };

    renderOverlay();
  }

  function recordToggleDebug(event) {
    lastToggleDecision = {
      ...event,
      textSnippet: truncateText(event?.textSnippet),
      matchedText: truncateText(event?.matchedText),
      capturedAt: new Date().toISOString(),
    };

    if (debugEnabled) {
      console.debug("[teex scroll debug]", lastToggleDecision);
    }
    renderOverlay();
  }

  return {
    installApi,
    recordToggleDebug,
  };
}
