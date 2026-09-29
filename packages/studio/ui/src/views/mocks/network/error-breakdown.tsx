import { cn } from "@/lib/utils";

import type { ErrorBreakdown as ErrorBreakdownData } from "./network-utils";

interface ErrorBreakdownProps {
  errors: ErrorBreakdownData;
}

interface FaultRow {
  label: string;
  count: number;
  color: string;
  bg: string;
}

export function ErrorBreakdown({ errors }: ErrorBreakdownProps): React.ReactElement {
  const total = errors.total;
  if (total === 0) return <></>;

  const rows: FaultRow[] = [
    { label: "500 Internal", count: errors.by500, color: "bg-rose-400/70", bg: "text-rose-400" },
    {
      label: "502 Bad Gateway",
      count: errors.by502,
      color: "bg-fuchsia-400/70",
      bg: "text-fuchsia-400",
    },
    { label: "503 Unavailable", count: errors.by503, color: "bg-rose-400/50", bg: "text-rose-300" },
    { label: "Timeout", count: errors.timeout, color: "bg-amber-400/70", bg: "text-amber-400" },
    { label: "Reset", count: errors.reset, color: "bg-orange-400/70", bg: "text-orange-400" },
    { label: "Other 4xx", count: errors.other4xx, color: "bg-sky-400/50", bg: "text-sky-400" },
    {
      label: "Other 5xx",
      count: errors.other5xx,
      color: "bg-violet-400/60",
      bg: "text-violet-400",
    },
  ].filter((r) => r.count > 0);

  return (
    <div className="space-y-2">
      {/* Stacked bar */}
      <div className="flex h-2 overflow-hidden rounded-full">
        {rows.map((r) => (
          <div
            key={r.label}
            className={cn("transition-all duration-500", r.color)}
            style={{ width: `${(r.count / total) * 100}%` }}
            title={`${r.label}: ${r.count}`}
          />
        ))}
      </div>

      {/* Legend rows */}
      <div className="space-y-1.5">
        {rows.map((r) => {
          const pct = Math.round((r.count / total) * 100);
          return (
            <div key={r.label} className="flex items-center gap-2">
              <div className={cn("size-1.5 shrink-0 rounded-full", r.color)} />
              <span className="flex-1 text-body-xs text-muted-foreground/70">{r.label}</span>
              <div className="flex items-center gap-2">
                <div className="h-1 w-16 overflow-hidden rounded-full bg-muted/30">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", r.color)}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={cn("w-8 text-right text-mono-xs tabular-nums", r.bg)}>{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
