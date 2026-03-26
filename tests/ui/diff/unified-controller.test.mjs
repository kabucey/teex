import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import { createUnifiedDiffController } from "../../../src/ui/diff/unified-controller.js";

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
