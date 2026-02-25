import test from "node:test";
import assert from "node:assert/strict";

import { shouldAutoCloseEmptyWindowAfterTransfer } from "../../src/tabs/transfer-controller.js";

test("auto-close after transfer only when non-folder window is empty", () => {
  assert.equal(
    shouldAutoCloseEmptyWindowAfterTransfer({ mode: "empty", activePath: null }, () => false),
    true,
  );
  assert.equal(
    shouldAutoCloseEmptyWindowAfterTransfer({ mode: "files", activePath: "/a.txt" }, () => false),
    false,
  );
  assert.equal(
    shouldAutoCloseEmptyWindowAfterTransfer({ mode: "files", activePath: null }, () => true),
    false,
  );
  assert.equal(
    shouldAutoCloseEmptyWindowAfterTransfer({ mode: "folder", activePath: null }, () => false),
    false,
  );
});
