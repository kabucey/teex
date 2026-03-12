function ensureNavState(obj) {
  if (!Array.isArray(obj.navHistory)) {
    obj.navHistory = [];
    obj.navHistoryCursor = -1;
  }
}

export function recordNavigation(navState, path) {
  if (!path) {
    return;
  }
  ensureNavState(navState);

  const current =
    navState.navHistoryCursor >= 0
      ? navState.navHistory[navState.navHistoryCursor]
      : null;
  if (current === path) {
    return;
  }

  navState.navHistory.splice(navState.navHistoryCursor + 1);
  navState.navHistory.push(path);
  navState.navHistoryCursor = navState.navHistory.length - 1;
}

export function canGoBack(navState) {
  return (navState.navHistoryCursor ?? -1) > 0;
}

export function canGoForward(navState) {
  if (!Array.isArray(navState.navHistory)) {
    return false;
  }
  return (
    navState.navHistoryCursor >= 0 &&
    navState.navHistoryCursor < navState.navHistory.length - 1
  );
}

export function goBack(navState) {
  ensureNavState(navState);
  if (!canGoBack(navState)) {
    return null;
  }
  navState.navHistoryCursor -= 1;
  return navState.navHistory[navState.navHistoryCursor];
}

export function goForward(navState) {
  ensureNavState(navState);
  if (!canGoForward(navState)) {
    return null;
  }
  navState.navHistoryCursor += 1;
  return navState.navHistory[navState.navHistoryCursor];
}
