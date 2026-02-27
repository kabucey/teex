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
    const info = String(token.info || "").trim().toLowerCase();
    if (info === "mermaid") {
      const startLine = token?.map ? token.map[0] + 1 : 1;
      const endLine = token?.map ? Math.max(startLine, token.map[1]) : startLine;
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

export function renderMarkdown(markdown) {
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  return getMarkdownParser().render(source);
}

let mermaidInitialized = false;

export async function renderMermaidDiagrams(previewEl) {
  if (!previewEl) {
    return;
  }

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

  const nodes = [...previewEl.querySelectorAll(".mermaid")];
  if (nodes.length === 0) {
    return;
  }

  await mermaid.run({
    nodes,
    suppressErrors: true,
  });
}
