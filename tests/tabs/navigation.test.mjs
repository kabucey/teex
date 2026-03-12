import assert from "node:assert/strict";
import test from "node:test";

import {
  canGoBack,
  canGoForward,
  goBack,
  goForward,
  recordNavigation,
} from "../../src/tabs/navigation.js";

function makeNavState(overrides = {}) {
  return {
    navHistory: [],
    navHistoryCursor: -1,
    ...overrides,
  };
}

test("recordNavigation pushes path and advances cursor", () => {
  const nav = makeNavState();
  recordNavigation(nav, "/a.md");
  assert.deepEqual(nav.navHistory, ["/a.md"]);
  assert.equal(nav.navHistoryCursor, 0);

  recordNavigation(nav, "/b.md");
  assert.deepEqual(nav.navHistory, ["/a.md", "/b.md"]);
  assert.equal(nav.navHistoryCursor, 1);
});

test("recordNavigation deduplicates consecutive same path", () => {
  const nav = makeNavState();
  recordNavigation(nav, "/a.md");
  recordNavigation(nav, "/a.md");
  assert.deepEqual(nav.navHistory, ["/a.md"]);
  assert.equal(nav.navHistoryCursor, 0);
});

test("recordNavigation truncates forward entries", () => {
  const nav = makeNavState({
    navHistory: ["/a.md", "/b.md", "/c.md"],
    navHistoryCursor: 0,
  });
  recordNavigation(nav, "/d.md");
  assert.deepEqual(nav.navHistory, ["/a.md", "/d.md"]);
  assert.equal(nav.navHistoryCursor, 1);
});

test("canGoBack returns false with empty history", () => {
  assert.equal(canGoBack(makeNavState()), false);
});

test("canGoBack returns false at cursor 0", () => {
  assert.equal(
    canGoBack(makeNavState({ navHistory: ["/a.md"], navHistoryCursor: 0 })),
    false,
  );
});

test("canGoBack returns true when cursor > 0", () => {
  assert.equal(
    canGoBack(
      makeNavState({
        navHistory: ["/a.md", "/b.md"],
        navHistoryCursor: 1,
      }),
    ),
    true,
  );
});

test("canGoForward returns false at end of history", () => {
  assert.equal(
    canGoForward(
      makeNavState({
        navHistory: ["/a.md", "/b.md"],
        navHistoryCursor: 1,
      }),
    ),
    false,
  );
});

test("canGoForward returns true when cursor < last index", () => {
  assert.equal(
    canGoForward(
      makeNavState({
        navHistory: ["/a.md", "/b.md"],
        navHistoryCursor: 0,
      }),
    ),
    true,
  );
});

test("goBack moves cursor back and returns target path", () => {
  const nav = makeNavState({
    navHistory: ["/a.md", "/b.md"],
    navHistoryCursor: 1,
  });
  const target = goBack(nav);
  assert.equal(target, "/a.md");
  assert.equal(nav.navHistoryCursor, 0);
});

test("goBack returns null when cannot go back", () => {
  const nav = makeNavState({
    navHistory: ["/a.md"],
    navHistoryCursor: 0,
  });
  assert.equal(goBack(nav), null);
});

test("goForward moves cursor forward and returns target path", () => {
  const nav = makeNavState({
    navHistory: ["/a.md", "/b.md"],
    navHistoryCursor: 0,
  });
  const target = goForward(nav);
  assert.equal(target, "/b.md");
  assert.equal(nav.navHistoryCursor, 1);
});

test("goForward returns null when cannot go forward", () => {
  const nav = makeNavState({
    navHistory: ["/a.md"],
    navHistoryCursor: 0,
  });
  assert.equal(goForward(nav), null);
});

test("per-tab history is independent", () => {
  const tab1 = makeNavState();
  const tab2 = makeNavState();

  recordNavigation(tab1, "/a.md");
  recordNavigation(tab1, "/b.md");
  recordNavigation(tab2, "/x.md");
  recordNavigation(tab2, "/y.md");

  assert.equal(goBack(tab1), "/a.md");
  assert.equal(goBack(tab2), "/x.md");

  assert.equal(canGoForward(tab1), true);
  assert.equal(canGoForward(tab2), true);

  assert.equal(goForward(tab1), "/b.md");
  assert.equal(goForward(tab2), "/y.md");
});

test("ensureNavState initializes missing fields", () => {
  const obj = {};
  recordNavigation(obj, "/a.md");
  assert.deepEqual(obj.navHistory, ["/a.md"]);
  assert.equal(obj.navHistoryCursor, 0);
});

test("canGoBack handles missing navHistory gracefully", () => {
  assert.equal(canGoBack({}), false);
});

test("canGoForward handles missing navHistory gracefully", () => {
  assert.equal(canGoForward({}), false);
});
