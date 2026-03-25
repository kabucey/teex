export function buildDiffTicks(annotations, totalLines) {
  if (totalLines < 1) return [];

  const valid = annotations
    .filter((a) => a.line >= 1 && a.line <= totalLines)
    .sort((a, b) => a.line - b.line);

  const ticks = [];

  for (const ann of valid) {
    const fraction = (ann.line - 1) / totalLines;
    const prev = ticks[ticks.length - 1];

    if (
      prev &&
      prev.diffType === ann.diff_type &&
      ann.line === prev.endLine + 1
    ) {
      prev.endLine = ann.line;
      prev.height += 1;
    } else {
      ticks.push({
        fraction,
        diffType: ann.diff_type,
        line: ann.line,
        endLine: ann.line,
        height: 1,
      });
    }
  }

  return ticks;
}

export function tickTop(fraction, trackHeight) {
  const clamped = Math.max(0, Math.min(1, fraction));
  return clamped * trackHeight;
}

export function tickHeight(lineCount, totalLines, trackHeight, minHeight) {
  if (totalLines < 1) return minHeight;
  return Math.max(minHeight, (lineCount / totalLines) * trackHeight);
}
