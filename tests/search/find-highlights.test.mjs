import assert from "node:assert/strict";
import test from "node:test";
import { findTextNodeMatches } from "../../src/search/find-highlights.js";

function makeTextNode(text) {
  return { nodeType: 3, textContent: text };
}

test("findTextNodeMatches returns empty array for empty query", () => {
  const nodes = [makeTextNode("hello world")];
  assert.deepEqual(findTextNodeMatches(nodes, ""), []);
});

test("findTextNodeMatches finds match in single text node", () => {
  const node = makeTextNode("hello world");
  const result = findTextNodeMatches([node], "world");
  assert.equal(result.length, 1);
  assert.equal(result[0].node, node);
  assert.equal(result[0].startOffset, 6);
  assert.equal(result[0].endOffset, 11);
});

test("findTextNodeMatches finds multiple matches in one node", () => {
  const node = makeTextNode("abc abc abc");
  const result = findTextNodeMatches([node], "abc");
  assert.equal(result.length, 3);
  assert.equal(result[0].startOffset, 0);
  assert.equal(result[1].startOffset, 4);
  assert.equal(result[2].startOffset, 8);
});

test("findTextNodeMatches is case insensitive", () => {
  const node = makeTextNode("Hello HELLO hello");
  const result = findTextNodeMatches([node], "hello");
  assert.equal(result.length, 3);
});

test("findTextNodeMatches finds matches across multiple text nodes", () => {
  const nodes = [makeTextNode("hello "), makeTextNode("world hello")];
  const result = findTextNodeMatches(nodes, "hello");
  assert.equal(result.length, 2);
  assert.equal(result[0].node, nodes[0]);
  assert.equal(result[0].startOffset, 0);
  assert.equal(result[1].node, nodes[1]);
  assert.equal(result[1].startOffset, 6);
});

test("findTextNodeMatches does not match across node boundaries", () => {
  const nodes = [makeTextNode("hel"), makeTextNode("lo")];
  const result = findTextNodeMatches(nodes, "hello");
  assert.equal(result.length, 0);
});

test("findTextNodeMatches handles regex special chars in query", () => {
  const node = makeTextNode("price is $10.00");
  const result = findTextNodeMatches([node], "$10.00");
  assert.equal(result.length, 1);
  assert.equal(result[0].startOffset, 9);
  assert.equal(result[0].endOffset, 15);
});

test("findTextNodeMatches skips non-text nodes", () => {
  const nodes = [
    { nodeType: 1, textContent: "element" },
    makeTextNode("hello world"),
  ];
  const result = findTextNodeMatches(nodes, "hello");
  assert.equal(result.length, 1);
  assert.equal(result[0].node, nodes[1]);
});

test("findTextNodeMatches returns empty for no matches", () => {
  const node = makeTextNode("hello world");
  const result = findTextNodeMatches([node], "xyz");
  assert.equal(result.length, 0);
});
