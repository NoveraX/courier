import { TIMING_PHASES } from "./timing-types";

// ── Component ──────────────────────────────────────────────────────────────

export function HeatmapLegend(): React.ReactElement {
  return (
    <div className="flex items-center gap-4 border-t border-border-subtle px-4 py-2">
      {TIMING_PHASES.map(({ key, label, color }) => (
        <div key={key} className="flex items-center gap-1.5">
          <div className={`size-2.5 rounded-sm ${color}`} />
          <span className="text-[10px] text-muted-foreground/50">{label}</span>
        </div>
      ))}
      <span className="ml-auto text-[10px] text-muted-foreground/30">
        Bar width = relative total duration
      </span>
    </div>
  );
}
