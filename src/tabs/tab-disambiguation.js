import { baseName, dirName } from "../utils/app-utils.js";

/**
 * Returns a Map<number, string> — tab index → folder suffix to display.
 * Only includes entries for tabs whose baseName appears 2+ times.
 */
export function buildTabDisambiguations(tabs) {
  const result = new Map();
  if (!tabs || tabs.length === 0) return result;

  // Group tab indices by baseName (skip null paths)
  const groups = new Map();
  for (let i = 0; i < tabs.length; i++) {
    const path = tabs[i].path;
    if (!path) continue;
    const name = baseName(path);
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(i);
  }

  for (const [, indices] of groups) {
    if (indices.length < 2) continue;
    disambiguateGroup(tabs, indices, result);
  }

  return result;
}

function disambiguateGroup(tabs, indices, result) {
  const segmentsList = indices.map((i) => {
    const dir = dirName(tabs[i].path);
    return dir === "." ? [] : dir.split("/").reverse();
  });

  const maxDepth = Math.max(...segmentsList.map((s) => s.length));
  let suffixes;

  for (let depth = 1; depth <= maxDepth; depth++) {
    suffixes = segmentsList.map((segs) =>
      segs.slice(0, depth).reverse().join("/"),
    );
    if (new Set(suffixes).size === suffixes.length) break;
  }

  if (suffixes) {
    for (let j = 0; j < indices.length; j++) {
      result.set(indices[j], suffixes[j]);
    }
  }
}
