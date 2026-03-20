import type { WaterfallRow, TimeGap } from "./types";
import { GAP_THRESHOLD_MS, GAP_VISUAL_MS } from "./constants";

// ── Timeline compression ──────────────────────────────────────────────────

interface RawGap {
  rawStart: number;
  rawEnd: number;
  duration: number;
}

/** Detect gaps between request clusters and compress dead time */
export function compressTimeline(rows: WaterfallRow[]): { rows: WaterfallRow[]; gaps: TimeGap[] } {
  if (rows.length <= 1) return { rows, gaps: [] };

  const sorted = [...rows].sort((a, b) => a.request.startedAt - b.request.startedAt);
  const rawGaps = detectGaps(sorted);

  if (rawGaps.length === 0) return { rows, gaps: [] };

  const compress = buildCompressor(rawGaps);

  const compressedRows = sorted.map((row) => ({
    ...row,
    offsetMs: compress(row.offsetMs),
  }));

  const gaps: TimeGap[] = rawGaps.map((g) => ({
    compressedOffsetMs: compress(g.rawStart),
    actualDurationMs: g.duration,
    widthMs: GAP_VISUAL_MS,
  }));

  return { rows: compressedRows, gaps };
}

/** Convert compressed timeline position back to real elapsed time */
export function decompressMs(compressedMs: number, gaps: TimeGap[]): number {
  let realMs = compressedMs;
  for (const gap of gaps) {
    if (compressedMs <= gap.compressedOffsetMs) break;
    const gapEnd = gap.compressedOffsetMs + gap.widthMs;
    if (compressedMs >= gapEnd) {
      realMs += gap.actualDurationMs - gap.widthMs;
    } else {
      const ratio = (compressedMs - gap.compressedOffsetMs) / gap.widthMs;
      realMs += (gap.actualDurationMs - gap.widthMs) * ratio;
      break;
    }
  }
  return realMs;
}

// ── Internal ──────────────────────────────────────────────────────────────

function detectGaps(sorted: WaterfallRow[]): RawGap[] {
  const gaps: RawGap[] = [];
  let maxEndSoFar = sorted[0]!.offsetMs + sorted[0]!.totalDuration;

  for (let i = 1; i < sorted.length; i++) {
    const currStart = sorted[i]!.offsetMs;
    const gap = currStart - maxEndSoFar;

    if (gap > GAP_THRESHOLD_MS) {
      gaps.push({ rawStart: maxEndSoFar, rawEnd: currStart, duration: gap });
    }

    maxEndSoFar = Math.max(maxEndSoFar, currStart + sorted[i]!.totalDuration);
  }

  return gaps;
}

function buildCompressor(gaps: RawGap[]): (rawMs: number) => number {
  return (rawMs: number): number => {
    let result = rawMs;
    for (const g of gaps) {
      if (rawMs <= g.rawStart) break;
      const removed = g.duration - GAP_VISUAL_MS;
      if (rawMs >= g.rawEnd) {
        result -= removed;
      } else {
        const ratio = (rawMs - g.rawStart) / g.duration;
        result = g.rawStart + GAP_VISUAL_MS * ratio;
        break;
      }
    }
    return result;
  };
}
