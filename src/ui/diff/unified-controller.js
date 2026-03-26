import { isTextInputActive } from "../behavior.js";
import { buildUnifiedDiffHtml } from "./unified-renderer.js";

export function getAdjacentTocId(tocItems, activeId, direction) {
  if (!tocItems.length) return activeId;
  const ids = tocItems.map((item) => item.dataset.target);
  const currentIndex = ids.indexOf(activeId);
  if (currentIndex === -1) return activeId;
  if (direction === "up") return ids[Math.max(0, currentIndex - 1)];
  return ids[Math.min(ids.length - 1, currentIndex + 1)];
}

function bindScrollspy(container) {
  const content = container.querySelector?.(".udiff-content");
  if (!content) return null;

  const files = Array.from(container.querySelectorAll(".udiff-file"));
  const tocItems = Array.from(container.querySelectorAll(".udiff-toc-item"));
  if (files.length === 0) return null;

  const tocMap = new Map();
  for (const item of tocItems) {
    tocMap.set(item.dataset.target, item);
  }

  let activeId = null;

  function setActive(id) {
    if (id === activeId) return;
    activeId = id;
    for (const item of tocItems) {
      item.classList.toggle(
        "udiff-toc-active",
        item.dataset.target === activeId,
      );
    }
    tocMap
      .get(activeId)
      ?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }

  function update() {
    const scrollTop = content.scrollTop;
    let found = files[0];
    for (const file of files) {
      if (file.offsetTop <= scrollTop + 4) {
        found = file;
      } else {
        break;
      }
    }
    setActive(found?.id ?? null);
  }

  function onTocClick(e) {
    e.preventDefault();
    const targetId = e.currentTarget.dataset.target;
    const targetEl = container.querySelector(`#${targetId}`);
    if (targetEl) {
      content.style.scrollBehavior = "auto";
      content.scrollTop = targetEl.offsetTop;
      content.style.scrollBehavior = "";
    }
    setActive(targetId);
  }

  function onKeyDown(e) {
    if (container.classList.contains("hidden")) return;
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (isTextInputActive(document.activeElement)) return;
    e.preventDefault();
    const direction = e.key === "ArrowDown" ? "down" : "up";
    const nextId = getAdjacentTocId(tocItems, activeId, direction);
    if (nextId === activeId) return;
    const targetEl = container.querySelector(`#${nextId}`);
    if (targetEl) {
      content.style.scrollBehavior = "auto";
      content.scrollTop = targetEl.offsetTop;
      content.style.scrollBehavior = "";
    }
    setActive(nextId);
  }

  for (const item of tocItems) {
    item.addEventListener("click", onTocClick);
  }

  update();
  content.addEventListener("scroll", update, { passive: true });
  document.addEventListener("keydown", onKeyDown);
  return () => {
    content.removeEventListener("scroll", update);
    document.removeEventListener("keydown", onKeyDown);
    for (const item of tocItems) {
      item.removeEventListener("click", onTocClick);
    }
  };
}

export function createUnifiedDiffController({ state, el, invoke }) {
  let debounceTimer = null;
  let cleanupScrollspy = null;

  async function fetchAndRender() {
    if (state.activeKind !== "diff" || !state.rootPath) {
      return;
    }
    const rootPath = state.rootPath;
    cleanupScrollspy?.();
    cleanupScrollspy = null;
    el.unifiedDiff.innerHTML = "";
    try {
      const fileDiffs = await invoke("git_diff_all", { root: rootPath });
      if (state.activeKind === "diff" && state.rootPath === rootPath) {
        el.unifiedDiff.innerHTML = buildUnifiedDiffHtml(fileDiffs);
        cleanupScrollspy = bindScrollspy(el.unifiedDiff);
      }
    } catch (err) {
      console.error("Failed to fetch unified diff:", err);
      if (state.activeKind === "diff") {
        el.unifiedDiff.innerHTML = buildUnifiedDiffHtml([]);
      }
    }
  }

  function refreshNow() {
    clearTimeout(debounceTimer);
    return fetchAndRender();
  }

  function scheduleRefresh() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fetchAndRender, 300);
  }

  return { refreshNow, scheduleRefresh };
}
