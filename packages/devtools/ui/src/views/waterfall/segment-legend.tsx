import { useMemo } from "react";

import { SEGMENT_CONFIG } from "./constants";
import type { SegmentKey, WaterfallRow } from "./types";

interface SegmentLegendProps {
  rows: WaterfallRow[];
}

/** Show only segment types that actually appear in the current data */
export function SegmentLegend({ rows }: SegmentLegendProps): React.ReactElement {
  const activeKeys = useMemo(() => {
    const seen = new Set<SegmentKey>();
    for (const row of rows) {
      for (const seg of row.segments) seen.add(seg.key);
    }
    return Array.from(seen);
  }, [rows]);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 overflow-hidden">
      {activeKeys.map((key) => {
        const config = SEGMENT_CONFIG[key];
        return (
          <div key={key} className="flex items-center gap-1">
            <div className={`size-2 shrink-0 rounded-sm ${config.bg}`} />
            <span className="text-caption text-muted-foreground whitespace-nowrap">{config.label}</span>
          </div>
        );
      })}
    </div>
  );
}
