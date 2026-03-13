import { baseName, dirName } from "../app-utils.js";

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
  // Build path segments arrays for each tab (from innermost to outermost)
  const segmentsList = indices.map((i) => {
    const dir = dirName(tabs[i].path);
    return dir === "." ? [] : dir.replace(/\\/g, "/").split("/").reverse();
  });

  // Start with 1 segment, increase until all are unique
  for (let depth = 1; depth <= 20; depth++) {
    const suffixes = segmentsList.map((segs) => {
      const taken = segs.slice(0, depth).reverse();
      return taken.join("/");
    });

    // Check if all suffixes are unique
    const unique = new Set(suffixes);
    if (unique.size === suffixes.length) {
      for (let j = 0; j < indices.length; j++) {
        result.set(indices[j], suffixes[j]);
      }
      return;
    }

    // If we've exhausted all segments for every entry, stop
    if (segmentsList.every((segs) => depth >= segs.length)) {
      for (let j = 0; j < indices.length; j++) {
        result.set(indices[j], suffixes[j]);
      }
      return;
    }
  }
}
