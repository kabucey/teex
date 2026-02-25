export function baseName(path) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
