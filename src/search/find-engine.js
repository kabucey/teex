import { escapeRegex } from "./regex-utils.js";

export function findMatches(content, query) {
  if (!query || !content) {
    return [];
  }

  const escaped = escapeRegex(query);
  const regex = new RegExp(escaped, "gi");
  const matches = [];

  for (
    let match = regex.exec(content);
    match !== null;
    match = regex.exec(content)
  ) {
    matches.push({ index: match.index, length: match[0].length });
  }

  return matches;
}
