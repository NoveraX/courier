import type { TimeGap, ZoomState } from "./types";
import { msToPixels } from "./helpers";

interface GapIndicatorProps {
  gap: TimeGap;
  zoom: ZoomState;
}

/** Visual marker for compressed dead time between request clusters */
export function GapIndicator({ gap, zoom }: GapIndicatorProps): React.ReactElement {
  const leftPx = msToPixels(gap.compressedOffsetMs, zoom.scale);
  const widthPx = msToPixels(gap.widthMs, zoom.scale);

  return (
    <div
      className="absolute inset-y-0 z-1 flex items-start justify-center overflow-hidden"
      style={{ left: leftPx, width: widthPx }}
    >
      {/* Solid background to mask grid lines behind the gap */}
      <div className="absolute inset-0 bg-background" />

      {/* Diagonal stripe pattern */}
      <div
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent, transparent 4px, var(--color-muted-foreground) 4px, var(--color-muted-foreground) 5px)",
        }}
      />

      {/* Dashed border markers */}
      <div className="absolute inset-y-0 left-0 w-px border-l border-dashed border-border" />
      <div className="absolute inset-y-0 right-0 w-px border-r border-dashed border-border" />

      {/* Gap duration label */}
      <span className="relative z-10 mt-4 whitespace-nowrap rounded border border-border-subtle bg-background-inset px-1.5 py-0.5 text-caption text-muted-foreground">
        {formatGapDuration(gap.actualDurationMs)}
      </span>
    </div>
  );
}

function formatGapDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1_000).toFixed(0)}s gap`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1_000);
  return secs > 0 ? `${mins}m ${secs}s gap` : `${mins}m gap`;
}
