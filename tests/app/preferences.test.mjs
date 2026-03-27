import assert from "node:assert/strict";
import test from "node:test";

import { toggleModifiedOnly } from "../../src/app/preferences.js";

const noop = () => {};
const noopInvoke = () => Promise.resolve();

test("toggleModifiedOnly turns filter on", () => {
  const state = { filterModifiedOnly: false, collapsedFolders: new Set() };
  const ls = { store: {} };
  global.localStorage = {
    setItem: (k, v) => {
      ls.store[k] = v;
    },
  };

  toggleModifiedOnly(state, noopInvoke, noop, noop);

  assert.equal(state.filterModifiedOnly, true);
  assert.equal(ls.store["teex-filter-modified-only"], "true");
});

test("toggleModifiedOnly expands all folders when turning filter on", () => {
  const state = {
    filterModifiedOnly: false,
    collapsedFolders: new Set(["docs", "docs/api", "src"]),
  };
  global.localStorage = { setItem: noop };

  toggleModifiedOnly(state, noopInvoke, noop, noop);

  assert.equal(state.filterModifiedOnly, true);
  assert.equal(state.collapsedFolders.size, 0);
});

test("toggleModifiedOnly does not expand folders when turning filter off", () => {
  const state = {
    filterModifiedOnly: true,
    collapsedFolders: new Set(["docs"]),
  };
  global.localStorage = { setItem: noop };

  toggleModifiedOnly(state, noopInvoke, noop, noop);

  assert.equal(state.filterModifiedOnly, false);
  assert.equal(state.collapsedFolders.size, 1);
});
