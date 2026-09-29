import { useMemo } from "react";
import { MAX_GRID_LINES } from "./constants";
import { computeTickInterval, msToPixels } from "./helpers";
import type { ZoomState } from "./types";

interface GridLinesProps {
  timeSpan: number;
  zoom: ZoomState;
}

/** Vertical grid lines aligned with ruler ticks */
export function GridLines({ timeSpan, zoom }: GridLinesProps): React.ReactElement {
  const interval = useMemo(() => computeTickInterval(zoom), [zoom]);

  const lines = useMemo(() => {
    const result: number[] = [];
    let ms = interval; // skip 0 (left edge)
    while (ms <= timeSpan && result.length < MAX_GRID_LINES) {
      result.push(msToPixels(ms, zoom.scale));
      ms += interval;
    }
    return result;
  }, [timeSpan, zoom.scale, interval]);

  return (
    <div className="pointer-events-none absolute inset-0">
      {lines.map((px) => (
        <div key={px} className="absolute inset-y-0 w-px bg-border/60" style={{ left: px }} />
      ))}
    </div>
  );
}
