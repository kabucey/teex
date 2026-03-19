import assert from "node:assert/strict";
import test from "node:test";
import { buildHighlightedHtml } from "../../src/search/editor-highlights.js";

test("returns escaped content with trailing newline when no query", () => {
  assert.equal(buildHighlightedHtml("hello", "", 0), "hello\n");
});

test("returns escaped content when query has no matches", () => {
  assert.equal(buildHighlightedHtml("hello", "xyz", 0), "hello\n");
});

test("wraps single match in mark", () => {
  assert.equal(
    buildHighlightedHtml("hello world", "world", 0),
    'hello <mark class="find-active">world</mark>\n',
  );
});

test("wraps multiple matches with active index", () => {
  const result = buildHighlightedHtml("abcabc", "abc", 1);
  assert.equal(
    result,
    '<mark>abc</mark><mark class="find-active">abc</mark>\n',
  );
});

test("escapes HTML in content", () => {
  assert.equal(
    buildHighlightedHtml("<b>bold</b>", "bold", 0),
    '&lt;b&gt;<mark class="find-active">bold</mark>&lt;/b&gt;\n',
  );
});

test("returns escaped content with trailing newline for empty query and content", () => {
  assert.equal(buildHighlightedHtml("", "", 0), "\n");
});

test("is case insensitive", () => {
  assert.equal(
    buildHighlightedHtml("Hello", "hello", 0),
    '<mark class="find-active">Hello</mark>\n',
  );
});
