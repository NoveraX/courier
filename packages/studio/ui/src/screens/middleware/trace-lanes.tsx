import type { ChainTrace } from "@/features/middleware/chain-trace";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { MiddlewareLook } from "./middleware-look";

const TICKS = [0, 0.25, 0.5, 0.75, 1] as const;

interface TraceLanesProps {
  trace: ChainTrace;
  looks: ReadonlyMap<string, MiddlewareLook>;
}

/**
 * A call's time as lanes: each middleware's time before the fetch and
 * after it — joined by a faint line while it waits on the rest — and the
 * fetch, against the call's whole span with its quarters marked.
 *
 * @param props - The trace, and the middleware's looks
 * @returns The lanes
 * @example
 * ```tsx
 * <TraceLanes trace={traceOf(request)} looks={looks} />
 * ```
 */
export function TraceLanes({ trace, looks }: TraceLanesProps): React.ReactNode {
  return (
    <div aria-hidden="true" className="flex flex-col gap-1.5 px-4.5 pt-4.5 pb-2">
      <div className="flex justify-between pl-30 font-mono text-micro text-fg-subtle">
        {TICKS.map((t) => (
          <span key={t}>{formatDuration(trace.span * t)}</span>
        ))}
      </div>
      {trace.lanes.map((lane) => {
        const tone = lane.kind === "fetch" ? "text-fg-muted" : looks.get(lane.name)?.tone;
        const [opening, closing] = lane.spans;
        return (
          <div
            key={`${lane.kind}-${lane.depth}`}
            className="grid h-7.5 grid-cols-[108px_minmax(0,1fr)_56px] items-center gap-3"
          >
            <span
              className="flex items-center gap-1.75 font-mono text-small whitespace-nowrap text-fg-muted"
              style={{ paddingLeft: `${Math.min(lane.depth, 6) * 6}px` }}
            >
              <span className={cn("size-1.75 rounded-[2px] bg-current", tone)} />
              {lane.name}
            </span>
            <span
              className={cn(
                "relative h-3 rounded-[3px] bg-[repeating-linear-gradient(90deg,var(--color-line)_0_1px,transparent_1px_25%)]",
                tone,
              )}
            >
              {opening && closing && (
                <span
                  className="absolute top-1.25 h-0.5 bg-current opacity-35"
                  style={{
                    left: `${(opening.start + opening.width) * 100}%`,
                    width: `${(closing.start - opening.start - opening.width) * 100}%`,
                  }}
                />
              )}
              {lane.spans.map((span) => (
                <span
                  key={span.start}
                  className="absolute inset-y-0 min-w-0.5 rounded-[3px] bg-current"
                  style={{ left: `${span.start * 100}%`, width: `${span.width * 100}%` }}
                />
              ))}
            </span>
            <span className="text-right font-mono text-label">{formatDuration(lane.duration)}</span>
          </div>
        );
      })}
    </div>
  );
}
