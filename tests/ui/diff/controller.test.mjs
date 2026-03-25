import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

import { createDiffController } from "../../../src/ui/diff/controller.js";

function makeMocks(overrides = {}) {
  const state = {
    activePath: "/repo/file.js",
    activeKind: "code",
    ...overrides.state,
  };

  const invokeResults = overrides.invokeResults || [
    [{ line: 1, diff_type: "added" }],
  ];
  let invokeCallIndex = 0;

  const invoke = mock.fn(async () => {
    const result = invokeResults[invokeCallIndex] ?? [];
    invokeCallIndex++;
    return result;
  });

  const setDiffDecorations = mock.fn();
  const clearDiffDecorations = mock.fn();

  const isAttached = overrides.isAttached ?? true;

  const codeEditorController = {
    setDiffDecorations,
    clearDiffDecorations,
    isAttached: () => isAttached,
  };

  return {
    state,
    invoke,
    codeEditorController,
    setDiffDecorations,
    clearDiffDecorations,
  };
}

describe("createDiffController", () => {
  it("refresh calls invoke with the active path", async () => {
    const { state, invoke, codeEditorController } = makeMocks();
    const ctrl = createDiffController({ state, invoke, codeEditorController });

    await ctrl.refresh();

    assert.equal(invoke.mock.calls.length, 1);
    assert.deepEqual(invoke.mock.calls[0].arguments, [
      "git_diff",
      { path: "/repo/file.js" },
    ]);
  });

  it("refresh applies decorations from invoke result", async () => {
    const annotations = [
      { line: 1, diff_type: "added" },
      { line: 5, diff_type: "added" },
    ];
    const { state, invoke, codeEditorController, setDiffDecorations } =
      makeMocks({ invokeResults: [annotations] });
    const ctrl = createDiffController({ state, invoke, codeEditorController });

    await ctrl.refresh();

    assert.equal(setDiffDecorations.mock.calls.length, 1);
    assert.deepEqual(
      setDiffDecorations.mock.calls[0].arguments[0],
      annotations,
    );
  });

  it("refresh clears decorations when no active path", async () => {
    const { state, invoke, codeEditorController, clearDiffDecorations } =
      makeMocks({ state: { activePath: null, activeKind: "code" } });
    const ctrl = createDiffController({ state, invoke, codeEditorController });

    await ctrl.refresh();

    assert.equal(invoke.mock.calls.length, 0);
    assert.equal(clearDiffDecorations.mock.calls.length, 1);
  });

  it("refresh clears decorations when code editor is not attached", async () => {
    const { state, invoke, codeEditorController, clearDiffDecorations } =
      makeMocks({
        state: { activePath: "/repo/file.md", activeKind: "markdown" },
      });
    codeEditorController.isAttached = () => false;
    const ctrl = createDiffController({ state, invoke, codeEditorController });

    await ctrl.refresh();

    assert.equal(invoke.mock.calls.length, 0);
    assert.equal(clearDiffDecorations.mock.calls.length, 1);
  });

  it("refresh fetches diffs for markdown when code editor is attached", async () => {
    const annotations = [{ line: 3, diff_type: "added" }];
    const { state, invoke, codeEditorController, setDiffDecorations } =
      makeMocks({
        state: { activePath: "/repo/readme.md", activeKind: "markdown" },
        invokeResults: [annotations],
      });
    codeEditorController.isAttached = () => true;
    const ctrl = createDiffController({ state, invoke, codeEditorController });

    await ctrl.refresh();

    assert.equal(invoke.mock.calls.length, 1);
    assert.deepEqual(invoke.mock.calls[0].arguments, [
      "git_diff",
      { path: "/repo/readme.md" },
    ]);
    assert.equal(setDiffDecorations.mock.calls.length, 1);
    assert.deepEqual(
      setDiffDecorations.mock.calls[0].arguments[0],
      annotations,
    );
  });

  it("refresh discards stale results when path changes", async () => {
    const { state, invoke, codeEditorController, setDiffDecorations } =
      makeMocks();

    // Make invoke change the path before returning
    invoke.mock.mockImplementation(async () => {
      state.activePath = "/repo/other.js";
      return [{ line: 1, diff_type: "added" }];
    });

    const ctrl = createDiffController({ state, invoke, codeEditorController });
    await ctrl.refresh();

    // Should NOT apply decorations since the path changed
    assert.equal(setDiffDecorations.mock.calls.length, 0);
  });

  it("refresh clears decorations on invoke error", async () => {
    const { state, codeEditorController, clearDiffDecorations } = makeMocks();

    const failingInvoke = mock.fn(async () => {
      throw new Error("git not found");
    });

    const ctrl = createDiffController({
      state,
      invoke: failingInvoke,
      codeEditorController,
    });
    await ctrl.refresh();

    assert.equal(clearDiffDecorations.mock.calls.length, 1);
  });

  it("clear immediately clears decorations", () => {
    const { state, invoke, codeEditorController, clearDiffDecorations } =
      makeMocks();
    const ctrl = createDiffController({ state, invoke, codeEditorController });

    ctrl.clear();

    assert.equal(clearDiffDecorations.mock.calls.length, 1);
  });

  it("refreshNow calls invoke immediately without debounce", async () => {
    const { state, invoke, codeEditorController } = makeMocks();
    const ctrl = createDiffController({ state, invoke, codeEditorController });

    const promise = ctrl.refreshNow();

    // invoke called synchronously (no 300ms wait)
    assert.equal(invoke.mock.calls.length, 1);
    await promise;
  });

  it("refreshNow applies cached annotations before fetch completes", async () => {
    const annotations = [{ line: 2, diff_type: "added" }];
    const { state, invoke, codeEditorController, setDiffDecorations } =
      makeMocks({ invokeResults: [annotations, annotations] });
    const ctrl = createDiffController({ state, invoke, codeEditorController });

    // First refresh populates the cache
    await ctrl.refresh();
    assert.equal(setDiffDecorations.mock.calls.length, 1);

    // refreshNow should apply cached annotations immediately
    const promise = ctrl.refreshNow();
    // Cache applied synchronously before await
    assert.equal(setDiffDecorations.mock.calls.length, 2);
    assert.deepEqual(
      setDiffDecorations.mock.calls[1].arguments[0],
      annotations,
    );
    await promise;
  });

  it("refresh stores results in cache for later use", async () => {
    const ann1 = [{ line: 1, diff_type: "added" }];
    const ann2 = [{ line: 1, diff_type: "added" }];
    const { state, invoke, codeEditorController, setDiffDecorations } =
      makeMocks({ invokeResults: [ann1, ann2] });
    const ctrl = createDiffController({ state, invoke, codeEditorController });

    await ctrl.refresh();
    assert.equal(setDiffDecorations.mock.calls.length, 1);

    // Switch to same file again — refreshNow uses cache
    const promise = ctrl.refreshNow();
    assert.equal(setDiffDecorations.mock.calls.length, 2);
    assert.deepEqual(setDiffDecorations.mock.calls[1].arguments[0], ann1);
    await promise;
  });

  it("invalidate clears cached annotations for a path", async () => {
    const annotations = [{ line: 1, diff_type: "added" }];
    const { state, invoke, codeEditorController, setDiffDecorations } =
      makeMocks({ invokeResults: [annotations, annotations] });
    const ctrl = createDiffController({ state, invoke, codeEditorController });

    // Populate cache
    await ctrl.refresh();
    assert.equal(setDiffDecorations.mock.calls.length, 1);

    // Invalidate
    ctrl.invalidate("/repo/file.js");

    // refreshNow should NOT apply cached annotations (cache was cleared)
    const promise = ctrl.refreshNow();
    // Only the invoke call happens, no immediate cache application
    assert.equal(setDiffDecorations.mock.calls.length, 1);
    await promise;
    // After await, the fresh fetch result is applied
    assert.equal(setDiffDecorations.mock.calls.length, 2);
  });
});
