import type { MiddlewareStat } from "@/features/middleware/middleware-stats";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { MiddlewareLook } from "./middleware-look";

interface MiddlewareCardsProps {
  stats: readonly MiddlewareStat[];
  looks: ReadonlyMap<string, MiddlewareLook>;
  /** Opens the chain of a call the middleware ran in. */
  onTrace: (name: string) => void;
}

function Stat({ label, value }: { label: string; value: string }): React.ReactNode {
  return (
    <div className="flex min-w-0 flex-col gap-0.75 bg-inset px-2.5 py-2">
      <span className="text-meta text-fg-subtle">{label}</span>
      <span className="font-mono text-ui font-medium whitespace-nowrap">{value}</span>
    </div>
  );
}

/**
 * A card a middleware: what it does and where it runs, its calls, average
 * and p95 time, its share of all middleware time, the headers it adds and
 * the runs that failed — opening the chain of a call it ran in.
 *
 * @param props - The middleware, their looks, and what opens a chain
 * @returns The cards
 * @example
 * ```tsx
 * <MiddlewareCards stats={overview.stats} looks={looks} onTrace={trace} />
 * ```
 */
export function MiddlewareCards({ stats, looks, onTrace }: MiddlewareCardsProps): React.ReactNode {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
      {stats.map((s) => {
        const look = looks.get(s.name);
        const Icon = look?.icon;
        return (
          <button
            key={s.name}
            type="button"
            onClick={() => onTrace(s.name)}
            className="flex min-w-0 cursor-pointer flex-col gap-3.5 rounded-sheet border border-line bg-panel p-4 text-left text-fg hover:border-line-strong focus-visible:outline-2 focus-visible:outline-brand"
          >
            <span className="flex w-full min-w-0 items-center gap-2.5">
              <span
                className={cn(
                  "flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[color-mix(in_srgb,currentColor_13%,transparent)]",
                  look?.tone,
                )}
              >
                {Icon && <Icon aria-hidden="true" className="size-3.75" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-mono text-item font-semibold">{s.name}</span>
                <span className="truncate text-label text-fg-subtle">{look?.description}</span>
              </span>
              <span className="flex h-5 shrink-0 items-center rounded-[5px] border border-line px-1.75 text-meta text-fg-muted">
                {s.phase}
              </span>
            </span>
            <span className="grid w-full grid-cols-3 gap-px overflow-hidden rounded-panel border border-line bg-line">
              <Stat label="Calls" value={String(s.calls)} />
              <Stat label="Avg" value={formatDuration(s.avg)} />
              <Stat label="P95" value={formatDuration(s.p95)} />
            </span>
            <span className="flex w-full flex-col gap-1.5">
              <span className="flex justify-between text-badge text-fg-subtle">
                share of middleware time
                <span className="font-mono text-fg-muted">{`${(s.share * 100).toFixed(0)}%`}</span>
              </span>
              <span className="h-1 overflow-hidden rounded-[2px] bg-raised">
                <span
                  className={cn("block h-full rounded-[2px] bg-current", look?.tone)}
                  style={{ width: `${s.share * 100}%` }}
                />
              </span>
            </span>
            <span className="flex min-h-5 flex-wrap gap-1.25">
              {s.headersAdded.map((header) => (
                <span
                  key={header}
                  className="flex h-5 items-center rounded-[5px] bg-ok-dim px-1.75 font-mono text-meta text-ok"
                >{`+ ${header}`}</span>
              ))}
              {s.errors > 0 && (
                <span className="flex h-5 items-center rounded-[5px] bg-err-dim px-1.75 font-mono text-meta text-err">{`${s.errors} failed`}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
