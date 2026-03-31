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
    html = html.replace(
      /^<pre/,
      `<pre data-src-line-start="${startLine}" data-src-line-end="${endLine}"`,
    );

    return `<div class="code-block"><button class="copy-btn" type="button" aria-label="Copy code"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 9h9v11H9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><div class="code-scroll">${html}</div></div>`;
  };

  getMarkdownParser.instance = md;
  return md;
}

export async function renderMarkdown(markdown) {
  await ensureMarkdownLibsLoaded();
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  return getMarkdownParser().render(source);
}

function createCopyButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "copy-btn";
  button.setAttribute("aria-label", "Copy code");
  button.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 9h9v11H9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M6 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return button;
}

export function addCopyButtons(previewEl) {
  if (!previewEl?.querySelectorAll) {
    return;
  }

  const containers = previewEl.querySelectorAll(".code-block, pre");
  containers.forEach((container) => {
    if (container.querySelector?.(".copy-btn")) {
      return;
    }

    container.appendChild(createCopyButton());
  });
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
