import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import {
  createUnifiedDiffController,
  getAdjacentTocId,
} from "../../../src/ui/diff/unified-controller.js";

function makeEl() {
  return {
    unifiedDiff: {
      innerHTML: "",
    },
  };
}

function setup({
  fileDiffs = [],
  activeKind = "diff",
  rootPath = "/project",
} = {}) {
  const el = makeEl();
  const invokeFn = mock.fn(async () => fileDiffs);
  const state = { activeKind, rootPath };
  const ctrl = createUnifiedDiffController({ state, el, invoke: invokeFn });
  return { state, el, ctrl, invokeFn };
}

function items(...ids) {
  return ids.map((id) => ({ dataset: { target: id } }));
}

describe("getAdjacentTocId", () => {
  it("moves down from first item", () => {
    assert.equal(getAdjacentTocId(items("a", "b", "c"), "a", "down"), "b");
  });

  it("moves down from middle item", () => {
    assert.equal(getAdjacentTocId(items("a", "b", "c"), "b", "down"), "c");
  });

  it("stays at last item when moving down at end", () => {
    assert.equal(getAdjacentTocId(items("a", "b", "c"), "c", "down"), "c");
  });

  it("moves up from last item", () => {
    assert.equal(getAdjacentTocId(items("a", "b", "c"), "c", "up"), "b");
  });

  it("moves up from middle item", () => {
    assert.equal(getAdjacentTocId(items("a", "b", "c"), "b", "up"), "a");
  });

  it("stays at first item when moving up at start", () => {
    assert.equal(getAdjacentTocId(items("a", "b", "c"), "a", "up"), "a");
  });

  it("returns activeId unchanged when not found in items", () => {
    assert.equal(getAdjacentTocId(items("a", "b"), "z", "down"), "z");
  });

  it("returns activeId unchanged for empty items list", () => {
    assert.equal(getAdjacentTocId(items(), "a", "down"), "a");
  });
});

describe("createUnifiedDiffController", () => {
  it("refreshNow calls invoke with git_diff_all when activeKind is diff", async () => {
    const { ctrl, invokeFn } = setup();
    await ctrl.refreshNow();
    assert.equal(invokeFn.mock.calls.length, 1);
    assert.equal(invokeFn.mock.calls[0].arguments[0], "git_diff_all");
    assert.deepEqual(invokeFn.mock.calls[0].arguments[1], { root: "/project" });
  });

  it("refreshNow does nothing when activeKind is not diff", async () => {
    const { ctrl, invokeFn } = setup({ activeKind: "code" });
    await ctrl.refreshNow();
    assert.equal(invokeFn.mock.calls.length, 0);
  });

  it("refreshNow does nothing when rootPath is absent", async () => {
    const { ctrl, invokeFn } = setup({ rootPath: null });
    await ctrl.refreshNow();
    assert.equal(invokeFn.mock.calls.length, 0);
  });

  it("refreshNow renders HTML into unifiedDiff element after fetch", async () => {
    const { el, ctrl } = setup({
      fileDiffs: [
        {
          rel_path: "a.txt",
          hunks: [
            { header: "@@", lines: [{ content: "hello", line_type: "added" }] },
          ],
        },
      ],
    });
    await ctrl.refreshNow();
    assert.ok(el.unifiedDiff.innerHTML.includes("a.txt"));
    assert.ok(el.unifiedDiff.innerHTML.includes("hello"));
  });

  it("refreshNow renders empty state when result is empty", async () => {
    const { el, ctrl } = setup({ fileDiffs: [] });
    await ctrl.refreshNow();
    assert.ok(el.unifiedDiff.innerHTML.includes("No changes to review"));
  });

  it("scheduleRefresh cancels a previous pending refresh", async () => {
    const { ctrl, invokeFn } = setup();
    ctrl.scheduleRefresh();
    ctrl.scheduleRefresh();
    ctrl.scheduleRefresh();
    await new Promise((r) => setTimeout(r, 400));
    // Only one fetch should have fired despite multiple scheduleRefresh calls
    assert.equal(invokeFn.mock.calls.length, 1);
  });

  it("refreshNow cancels a pending scheduleRefresh", async () => {
    const { ctrl, invokeFn } = setup();
    ctrl.scheduleRefresh(); // queues a delayed fetch
    await ctrl.refreshNow(); // cancels it, fires immediately
    await new Promise((r) => setTimeout(r, 400));
    // Only the immediate refresh should have fired
    assert.equal(invokeFn.mock.calls.length, 1);
  });

  it("does not render if activeKind changes before fetch resolves", async () => {
    const el = makeEl();
    let resolveFetch;
    const invokeFn = mock.fn(
      () =>
        new Promise((r) => {
          resolveFetch = r;
        }),
    );
    const state = { activeKind: "diff", rootPath: "/project" };
    const ctrl = createUnifiedDiffController({ state, el, invoke: invokeFn });

    const p = ctrl.refreshNow();
    // Change away from diff tab before fetch resolves
    state.activeKind = "code";
    resolveFetch([]);
    await p;
    // Should not have updated innerHTML
    assert.equal(el.unifiedDiff.innerHTML, "");
  });
});
