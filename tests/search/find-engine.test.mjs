import assert from "node:assert/strict";
import test from "node:test";
import { findMatches } from "../../src/search/find-engine.js";

test("findMatches returns empty array for empty query", () => {
  assert.deepEqual(findMatches("hello world", ""), []);
});

test("findMatches returns empty array for empty content", () => {
  assert.deepEqual(findMatches("", "hello"), []);
});

test("findMatches finds a single match", () => {
  assert.deepEqual(findMatches("hello world", "world"), [
    { index: 6, length: 5 },
  ]);
});

test("findMatches finds multiple matches", () => {
  assert.deepEqual(findMatches("abcabc", "abc"), [
    { index: 0, length: 3 },
    { index: 3, length: 3 },
  ]);
});

test("findMatches is case insensitive", () => {
  assert.deepEqual(findMatches("Hello HELLO hello", "hello"), [
    { index: 0, length: 5 },
    { index: 6, length: 5 },
    { index: 12, length: 5 },
  ]);
});

test("findMatches escapes regex special characters", () => {
  assert.deepEqual(findMatches("price is $10.00", "$10.00"), [
    { index: 9, length: 6 },
  ]);
});

test("findMatches handles regex special chars in query", () => {
  assert.deepEqual(findMatches("a (b) [c] {d}", "(b)"), [
    { index: 2, length: 3 },
  ]);
});

test("findMatches finds adjacent non-overlapping matches", () => {
  assert.deepEqual(findMatches("aaaa", "aa"), [
    { index: 0, length: 2 },
    { index: 2, length: 2 },
  ]);
});

test("findMatches handles unicode content", () => {
  const result = findMatches("café café", "café");
  assert.equal(result.length, 2);
  assert.equal(result[0].index, 0);
  assert.equal(result[0].length, 4);
});

test("findMatches handles multiline content", () => {
  const content = "line one\nline two\nline three";
  assert.deepEqual(findMatches(content, "line"), [
    { index: 0, length: 4 },
    { index: 9, length: 4 },
    { index: 18, length: 4 },
  ]);
});

test("findMatches returns correct length for mixed-case match", () => {
  const result = findMatches("FoOBar", "foobar");
  assert.deepEqual(result, [{ index: 0, length: 6 }]);
});
