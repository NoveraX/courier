import { cn } from "@/lib/utils";
import { formatDuration } from "@/components/shared/formatters";
import type { RequestEntry } from "@/store/types";

interface MiddlewareTimingProps {
  entries: RequestEntry["middlewareEntries"];
}

export function MiddlewareTiming({ entries }: MiddlewareTimingProps): React.ReactElement {
  return (
    <div>
      <h4 className="text-caption text-muted-foreground mb-2">Middleware Chain</h4>
      <div className="rounded-lg border border-border-subtle divide-y divide-border-subtle">
        {entries.map((mw, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-1.5">
            <div className="flex items-center gap-2">
              <span className={cn(
                "size-1.5 rounded-full",
                mw.status === "completed" ? "bg-emerald-400" : mw.status === "error" ? "bg-rose-400" : "bg-amber-400 animate-pulse",
              )} />
              <span className="mono-sm text-foreground">{mw.name}</span>
            </div>
            {mw.duration != null && (
              <span className="mono-sm text-muted-foreground tabular-nums">
                {formatDuration(mw.duration)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
