import type { LyricsLine } from "./lyrics.types";

/** Index of the last line that has started by `time` (seconds), or -1 before the first line. */
export function activeLyricIndex(lines: LyricsLine[], time: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lines[middle].time <= time) { found = middle; low = middle + 1; }
    else high = middle - 1;
  }
  return found;
}
