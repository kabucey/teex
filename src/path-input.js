export function normalizeIncomingPaths(paths) {
  if (!Array.isArray(paths)) {
    return [];
  }

  return [...new Set(paths.filter((path) => typeof path === "string" && path.trim() !== ""))];
}

export function extractDragDropPaths(payload) {
  if (!payload) {
    return [];
  }

  if (Array.isArray(payload)) {
    return normalizeIncomingPaths(payload);
  }

  if (Array.isArray(payload.paths)) {
    return normalizeIncomingPaths(payload.paths);
  }

  return [];
}

export function hasFileDragData(event) {
  const types = event?.dataTransfer?.types;
  if (!types) {
    return false;
  }

  return Array.from(types).includes("Files");
}
