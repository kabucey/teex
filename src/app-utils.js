export function baseName(path) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}

export function dirName(path) {
  const normalized = path.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash === -1 ? "." : normalized.substring(0, lastSlash);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function isCursorOutsideWindow(clientX, clientY) {
  return (
    clientX < 0 ||
    clientX > window.innerWidth ||
    clientY < 0 ||
    clientY > window.innerHeight
  );
}
