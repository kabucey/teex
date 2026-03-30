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

export function fileExtension(path) {
  if (typeof path !== "string" || !path) return "";
  const fileName = baseName(path);
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === fileName.length - 1) return "";
  return fileName.slice(dotIndex + 1).toLowerCase();
}

function isDockerfileLike(name) {
  return (
    name === "Dockerfile" ||
    name.startsWith("Dockerfile.") ||
    name.endsWith(".Dockerfile")
  );
}

export function fileLanguageKey(path) {
  if (!path) return null;
  const name = baseName(path);
  if (isDockerfileLike(name)) return "dockerfile";
  const ext = fileExtension(path);
  if (ext) return ext;
  return null;
}

export function selectAllContents(element) {
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function isCursorOutsideWindow(clientX, clientY) {
  return (
    clientX < 0 ||
    clientX > window.innerWidth ||
    clientY < 0 ||
    clientY > window.innerHeight
  );
}
