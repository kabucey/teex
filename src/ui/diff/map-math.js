const MERGE_THRESHOLD = 0.004;

export function buildDiffTicks(annotations, totalLines) {
  if (totalLines < 1) return [];

  const valid = annotations
    .filter((a) => a.line >= 1 && a.line <= totalLines)
    .sort((a, b) => a.line - b.line);

  const divisor = Math.max(1, totalLines - 1);
  const ticks = [];

  for (const ann of valid) {
    const fraction = (ann.line - 1) / divisor;
    const prev = ticks[ticks.length - 1];

    if (
      prev &&
      prev.diffType === ann.diff_type &&
      fraction - prev.fraction < MERGE_THRESHOLD
    ) {
      prev.height += 1;
    } else {
      ticks.push({
        fraction,
        diffType: ann.diff_type,
        line: ann.line,
        height: 1,
      });
    }
  }

  return ticks;
}

export function tickTop(fraction, trackHeight, tickHeight) {
  const clamped = Math.max(0, Math.min(1, fraction));
  return clamped * (trackHeight - tickHeight);
}
