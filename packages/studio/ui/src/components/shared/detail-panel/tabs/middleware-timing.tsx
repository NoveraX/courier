import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { RequestEntry } from "@/store/types";

interface MiddlewareTimingProps {
  entries: RequestEntry["middlewareEntries"];
}

export function MiddlewareTiming({ entries }: MiddlewareTimingProps): React.ReactElement {
  return (
    <div>
      <h4 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        Middleware Chain
      </h4>
      <div className="overflow-hidden rounded-lg border border-border-subtle">
        {entries.map((mw, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: the middleware chain in its order of execution; a step's place is its identity
            key={i}
            className="flex items-center gap-3 border-b border-border-subtle px-3 py-2 last:border-b-0"
          >
            <div
              className={cn(
                "size-2 shrink-0 rounded-full ring-2",
                mw.status === "completed" && "bg-emerald-400 ring-emerald-400/20",
                mw.status === "error" && "bg-rose-400 ring-rose-400/20",
                mw.status === "running" && "bg-amber-400 ring-amber-400/20 animate-pulse",
              )}
            />
            <span className="flex-1 mono-sm text-foreground">{mw.name}</span>
            {mw.status === "error" && <span className="text-caption text-rose-400">error</span>}
            {mw.duration != null && (
              <span className="mono-sm tabular-nums text-muted-foreground">
                {formatDuration(mw.duration)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
