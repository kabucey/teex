function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function ensureMarkdownLibsLoaded() {
  if (typeof globalThis.markdownit === "function") {
    return;
  }
  await loadScript("/vendor/markdown-it.min.js");
  await loadScript("/vendor/markdown-it-task-lists.min.js");
}

function getMarkdownParser() {
  if (getMarkdownParser.instance) {
    return getMarkdownParser.instance;
  }

  const markdownItFactory = globalThis.markdownit;
  if (typeof markdownItFactory !== "function") {
    throw new Error("markdown-it is not loaded");
  }

  const md = markdownItFactory({
    html: false,
    linkify: true,
    breaks: true,
  });

  const taskListsPlugin = globalThis.markdownitTaskLists;
  if (typeof taskListsPlugin === "function") {
    md.use(taskListsPlugin, { enabled: true, label: false });
  }

  const defaultRenderToken = md.renderer.renderToken.bind(md.renderer);
  md.renderer.renderToken = (tokens, index, options) => {
    const token = tokens[index];
    if (token?.map && (token.nesting === 1 || token.type === "hr")) {
      const startLine = token.map[0] + 1;
      const endLine = Math.max(startLine, token.map[1]);
      token.attrSet("data-src-line-start", String(startLine));
      token.attrSet("data-src-line-end", String(endLine));

      if (token.type === "list_item_open") {
        token.attrSet("data-src-line", String(startLine));
      }
    }
    return defaultRenderToken(tokens, index, options);
  };

  const defaultFenceRule = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index];
    const info = String(token.info || "")
      .trim()
      .toLowerCase();
    if (info === "mermaid") {
      const startLine = token?.map ? token.map[0] + 1 : 1;
      const endLine = token?.map
        ? Math.max(startLine, token.map[1])
        : startLine;
      const content = md.utils.escapeHtml(token.content || "");
      return `<div class="mermaid" data-src-line-start="${startLine}" data-src-line-end="${endLine}">${content}</div>\n`;
    }

    let html = "";
    if (typeof defaultFenceRule === "function") {
      html = defaultFenceRule(tokens, index, options, env, self);
    } else {
      html = self.renderToken(tokens, index, options);
    }

    if (!token?.map) {
      return html;
    }

    const startLine = token.map[0] + 1;
    const endLine = Math.max(startLine, token.map[1]);
    return html.replace(
      /^<pre/,
      `<pre data-src-line-start="${startLine}" data-src-line-end="${endLine}"`,
    );
  };

  getMarkdownParser.instance = md;
  return md;
}

const COPY_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const CHECK_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

export function addCopyButtons(previewEl) {
  if (!previewEl) return;
  const blocks = previewEl.querySelectorAll("pre");
  for (const pre of blocks) {
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.setAttribute("aria-label", "Copy code");
    btn.innerHTML = COPY_ICON;
    btn.addEventListener("click", async () => {
      const code = pre.querySelector("code");
      const text = code ? code.textContent : pre.textContent;
      try {
        await navigator.clipboard.writeText(text);
        btn.innerHTML = CHECK_ICON;
        setTimeout(() => {
          btn.innerHTML = COPY_ICON;
        }, 1500);
      } catch {
        // clipboard write not available
      }
    });
    pre.appendChild(btn);
  }
}

export async function renderMarkdown(markdown) {
  await ensureMarkdownLibsLoaded();
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  return getMarkdownParser().render(source);
}

let mermaidInitialized = false;

async function ensureMermaidLoaded() {
  if (globalThis.mermaid) {
    return;
  }
  await loadScript("/vendor/mermaid.min.js");
}

export async function renderMermaidDiagrams(previewEl) {
  if (!previewEl) {
    return;
  }

  const hasMermaidBlocks = previewEl.querySelector(".mermaid") !== null;
  if (!hasMermaidBlocks) {
    return;
  }

  await ensureMermaidLoaded();

  const mermaid = globalThis.mermaid;
  if (!mermaid || typeof mermaid.run !== "function") {
    return;
  }

  if (!mermaidInitialized && typeof mermaid.initialize === "function") {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "dark",
    });
    mermaidInitialized = true;
  }

  await mermaid.run({
    nodes: [...previewEl.querySelectorAll(".mermaid")],
    suppressErrors: true,
  });
}
