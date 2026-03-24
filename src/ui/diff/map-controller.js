import { buildDiffTicks, tickTop } from "./map-math.js";

const TICK_HEIGHT = 3;

export function createDiffMapController({ el, codeEditorController }) {
  let tickEntries = [];
  let cachedScroller = null;
  let rafId = null;

  const container = document.createElement("div");
  container.classList.add("diff-map", "hidden");
  el.editorState.appendChild(container);

  container.addEventListener("click", (e) => {
    const line = e.target.getAttribute("data-line");
    if (line) {
      codeEditorController.scrollToLine(parseInt(line, 10));
    }
  });

  const observer = new ResizeObserver(() => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      reposition();
    });
  });

  function reposition() {
    if (!cachedScroller) return;
    const trackHeight = cachedScroller.clientHeight;
    if (trackHeight <= 0) return;

    for (const { el: tickEl, fraction, height } of tickEntries) {
      const h = Math.max(TICK_HEIGHT, height * 3);
      tickEl.style.top = `${tickTop(fraction, trackHeight, h)}px`;
      tickEl.style.height = `${h}px`;
    }
  }

  function build(ticks) {
    container.textContent = "";
    tickEntries = [];

    for (const tick of ticks) {
      const tickEl = document.createElement("div");
      tickEl.classList.add("diff-map-tick", `diff-map-tick--${tick.diffType}`);
      tickEl.setAttribute("data-line", String(tick.line));
      container.appendChild(tickEl);
      tickEntries.push({
        el: tickEl,
        fraction: tick.fraction,
        height: tick.height,
      });
    }
  }

  function update(annotations, totalLines) {
    container.classList.remove("hidden");
    cachedScroller = el.codeEditor.querySelector(".cm-scroller");
    build(buildDiffTicks(annotations, totalLines));
    reposition();
    if (cachedScroller) {
      observer.disconnect();
      observer.observe(cachedScroller);
    }
  }

  function hide() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    container.classList.add("hidden");
    container.textContent = "";
    tickEntries = [];
    cachedScroller = null;
    observer.disconnect();
  }

  function destroy() {
    hide();
    el.editorState.removeChild(container);
  }

  return { update, hide, destroy };
}
