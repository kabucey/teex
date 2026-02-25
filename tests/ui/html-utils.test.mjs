import test from "node:test";
import assert from "node:assert/strict";

import { escapeAttr, escapeHtml } from "../../src/ui/html-utils.js";

test("escapeHtml escapes html-significant characters", () => {
  assert.equal(
    escapeHtml(`<tag attr="x">'&`),
    "&lt;tag attr=&quot;x&quot;&gt;&#39;&amp;",
  );
});

test("escapeAttr delegates to html escaping", () => {
  assert.equal(escapeAttr(`"quoted"`), "&quot;quoted&quot;");
});
