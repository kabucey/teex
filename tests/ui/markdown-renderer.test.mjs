import test from "node:test";
import assert from "node:assert/strict";

import { renderMarkdown } from "../../src/ui/markdown-renderer.js";

test("renders headings, emphasis, and links", () => {
  const html = renderMarkdown("# Title\n\nText with **bold** and [link](https://example.com).");
  assert.match(html, /<h1 data-src-line-start="1" data-src-line-end="1">Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<a href="https:\/\/example\.com"/);
});

test("escapes raw html while preserving inline markdown", () => {
  const html = renderMarkdown("<script>alert(1)<\\/script> and `code`");
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\\\/script&gt;/);
  assert.match(html, /<code>code<\/code>/);
});

test("renders fenced code blocks and task lists", () => {
  const html = renderMarkdown("```js\nconst x = 1;\n```\n\n- [x] done\n- [ ] todo");
  assert.match(html, /<pre[^>]*><code class="language-js">const x = 1;/);
  assert.match(html, /<pre data-src-line-start="1" data-src-line-end="3">/);
  assert.match(html, /type="checkbox" data-src-line="5" checked/);
  assert.match(html, /type="checkbox" data-src-line="6"  \/>|type="checkbox" data-src-line="6" \/>/);
});

test("renders tables and blockquotes", () => {
  const html = renderMarkdown(
    "> quoted\n\n| a | b |\n| --- | --- |\n| 1 | 2 |",
  );
  assert.match(html, /<blockquote[^>]*><p>quoted<\/p><\/blockquote>/);
  assert.match(html, /data-src-line-start="1" data-src-line-end="1"/);
  assert.match(html, /<table[^>]*>/);
  assert.match(html, /<th>a<\/th>/);
  assert.match(html, /<td>2<\/td>/);
});

test("renders nested list items as nested lists", () => {
  const html = renderMarkdown("# List\n\n- list 1\n    - sub\n- item 2\n    - sub 2");
  assert.match(
    html,
    /<ul[^>]*><li>list 1<ul><li>sub<\/li><\/ul><\/li><li>item 2<ul><li>sub 2<\/li><\/ul><\/li><\/ul>/,
  );
});
