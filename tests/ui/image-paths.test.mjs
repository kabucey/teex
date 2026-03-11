import assert from "node:assert/strict";
import test from "node:test";

import { resolveImagePath } from "../../src/ui/image-paths.js";

test("resolveImagePath returns null for http URLs", () => {
  assert.equal(resolveImagePath("http://example.com/img.png", "/tmp"), null);
  assert.equal(resolveImagePath("https://example.com/img.png", "/tmp"), null);
});

test("resolveImagePath returns absolute paths unchanged", () => {
  assert.equal(
    resolveImagePath("/images/photo.png", "/tmp"),
    "/images/photo.png",
  );
});

test("resolveImagePath resolves relative paths against fileDir", () => {
  assert.equal(
    resolveImagePath("img/photo.png", "/Users/kel/docs"),
    "/Users/kel/docs/img/photo.png",
  );
});

test("resolveImagePath normalizes parent directory segments", () => {
  assert.equal(
    resolveImagePath("../assets/logo.png", "/Users/kel/docs"),
    "/Users/kel/assets/logo.png",
  );
});

test("resolveImagePath normalizes dot segments", () => {
  assert.equal(
    resolveImagePath("./photo.png", "/Users/kel/docs"),
    "/Users/kel/docs/photo.png",
  );
});
