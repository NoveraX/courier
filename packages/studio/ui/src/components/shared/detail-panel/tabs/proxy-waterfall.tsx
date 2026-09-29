import { formatDuration } from "@/components/shared/formatters";
import { cn } from "@/lib/utils";
import type { ProxyTiming } from "@/store/types-events";

const PHASES: { key: keyof ProxyTiming; label: string; color: string }[] = [
  { key: "clientToProxy", label: "Upload", color: "bg-blue-500" },
  { key: "proxyToBackend", label: "Processing", color: "bg-amber-500" },
  { key: "backendToProxy", label: "Backend", color: "bg-emerald-500" },
  { key: "proxyToClient", label: "Download", color: "bg-violet-500" },
];

interface ProxyWaterfallProps {
  timing: ProxyTiming;
  total: number;
}

export function ProxyWaterfall({ timing, total }: ProxyWaterfallProps): React.ReactElement {
  let offset = 0;
  const rows = PHASES.map((phase) => {
    const value = timing[phase.key];
    const start = offset;
    offset += value;
    return { ...phase, value, start };
  }).filter((r) => r.value > 0);

  return (
    <div>
      <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        Waterfall
      </h4>
      <div className="overflow-hidden rounded-lg border border-border-subtle">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex items-center gap-3 border-b border-border-subtle px-3 py-2 last:border-b-0"
          >
            <span className="w-20 shrink-0 text-body-sm text-muted-foreground">{row.label}</span>
            <div className="relative h-5 flex-1 rounded bg-muted/10">
              <div
                className={cn(
                  "absolute bottom-0.5 top-0.5 rounded opacity-80 transition-all duration-500",
                  row.color,
                )}
                style={{
                  left: `${(row.start / total) * 100}%`,
                  width: `${Math.max((row.value / total) * 100, 2)}%`,
                }}
              />
            </div>
            <span className="w-16 shrink-0 text-right mono-sm tabular-nums text-foreground">
              {formatDuration(row.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
