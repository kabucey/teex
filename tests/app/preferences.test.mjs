import assert from "node:assert/strict";
import test from "node:test";

import { toggleModifiedOnly } from "../../src/app/preferences.js";

const noop = () => {};
const noopInvoke = () => Promise.resolve();

test("toggleModifiedOnly turns filter on", () => {
  const state = { filterModifiedOnly: false, collapsedFolders: new Set(), savedCollapsedFolders: null };
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
    savedCollapsedFolders: null,
  };
  global.localStorage = { setItem: noop };

  toggleModifiedOnly(state, noopInvoke, noop, noop);

  assert.equal(state.filterModifiedOnly, true);
  assert.equal(state.collapsedFolders.size, 0);
  assert.deepEqual(state.savedCollapsedFolders, new Set(["docs", "docs/api", "src"]));
});

test("toggleModifiedOnly restores folder state when turning filter off", () => {
  const state = {
    filterModifiedOnly: false,
    collapsedFolders: new Set(["docs", "src"]),
    savedCollapsedFolders: null,
  };
  global.localStorage = { setItem: noop };

  // Turn on — snapshots and expands
  toggleModifiedOnly(state, noopInvoke, noop, noop);
  assert.equal(state.collapsedFolders.size, 0);

  // Turn off — restores snapshot
  toggleModifiedOnly(state, noopInvoke, noop, noop);
  assert.equal(state.filterModifiedOnly, false);
  assert.deepEqual(state.collapsedFolders, new Set(["docs", "src"]));
  assert.equal(state.savedCollapsedFolders, null);
});

test("toggleModifiedOnly leaves collapsedFolders unchanged when turning off with no snapshot", () => {
  const state = {
    filterModifiedOnly: true,
    collapsedFolders: new Set(["docs"]),
    savedCollapsedFolders: null,
  };
  global.localStorage = { setItem: noop };

  toggleModifiedOnly(state, noopInvoke, noop, noop);

  assert.equal(state.filterModifiedOnly, false);
  assert.equal(state.collapsedFolders.size, 1);
});
