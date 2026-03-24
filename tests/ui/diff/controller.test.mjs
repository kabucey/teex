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

  const codeEditorController = {
    setDiffDecorations,
    clearDiffDecorations,
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

  it("refresh clears decorations when activeKind is not code", async () => {
    const { state, invoke, codeEditorController, clearDiffDecorations } =
      makeMocks({
        state: { activePath: "/repo/file.md", activeKind: "markdown" },
      });
    const ctrl = createDiffController({ state, invoke, codeEditorController });

    await ctrl.refresh();

    assert.equal(invoke.mock.calls.length, 0);
    assert.equal(clearDiffDecorations.mock.calls.length, 1);
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
});
