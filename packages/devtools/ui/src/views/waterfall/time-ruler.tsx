import { useMemo } from "react";

import type { TimeGap, ZoomState } from "./types";
import { computeTickInterval, decompressMs, msToPixels, pixelsToMs, formatRulerTick } from "./helpers";
import { MAX_GRID_LINES } from "./constants";

interface TimeRulerProps {
  timeSpan: number;
  zoom: ZoomState;
  cursorX: number | null;
  totalWidth: number;
  gaps: TimeGap[];
}

export function TimeRuler({ timeSpan, zoom, cursorX, totalWidth, gaps }: TimeRulerProps): React.ReactElement {
  const interval = useMemo(() => computeTickInterval(zoom), [zoom]);

  const ticks = useMemo(() => {
    const result: Array<{ ms: number; px: number; label: string }> = [];
    let ms = 0;
    while (ms <= timeSpan && result.length < MAX_GRID_LINES) {
      const realMs = decompressMs(ms, gaps);
      result.push({ ms, px: msToPixels(ms, zoom.scale), label: formatRulerTick(realMs) });
      ms += interval;
    }
    return result;
  }, [timeSpan, zoom.scale, interval, gaps]);

  const cursorMs = cursorX !== null
    ? decompressMs(Math.max(0, pixelsToMs(cursorX, zoom.scale)), gaps)
    : null;

  return (
    <div
      className="sticky top-0 z-10 h-6 min-w-full shrink-0 border-b border-border-subtle bg-background/95 backdrop-blur-sm"
      style={{ width: totalWidth }}
    >
      {ticks.map((tick) => (
        <div key={tick.ms} className="absolute top-0 h-full" style={{ left: tick.px }}>
          <div className="absolute bottom-0 h-2 w-px bg-border" />
          <span className="absolute bottom-2 left-1 text-caption text-muted-foreground select-none whitespace-nowrap">
            {tick.label}
          </span>
        </div>
      ))}

      {cursorX !== null && cursorMs !== null && (
        <>
          <div className="absolute top-0 h-full w-px bg-accent-brand" style={{ left: cursorX }} />
          <span
            className="absolute top-0.5 -translate-x-1/2 rounded bg-accent-brand px-1 py-px text-[10px] font-medium text-white select-none whitespace-nowrap"
            style={{ left: cursorX }}
          >
            {formatRulerTick(cursorMs)}
          </span>
        </>
      )}
    </div>
  );
}
