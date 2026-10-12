import type { MiddlewareOverview } from "@/features/middleware/middleware-stats";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { MiddlewareLook } from "./middleware-look";

/* From this share of the calls' time, middleware is worth a look. */
const NOTICEABLE = 20;

interface OverheadHeroProps {
  overview: MiddlewareOverview;
  looks: ReadonlyMap<string, MiddlewareLook>;
}

function Figure({
  label,
  value,
  sub,
  tone = "text-fg",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: string;
}): React.ReactNode {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 bg-panel px-4.5 py-4">
      <span className="text-label text-fg-subtle">{label}</span>
      <span className={cn("truncate font-mono text-stat font-medium tracking-[-0.025em]", tone)}>
        {value}
      </span>
      <span className="truncate text-badge text-fg-subtle max-sm:whitespace-normal">{sub}</span>
    </div>
  );
}

/**
 * The top of the Middleware overview: the share of the traced calls' time
 * spent in middleware, in a ring, what that means, each middleware's part
 * of it, and four figures — time a call, the slowest step, how many there
 * are by phase, and the runs that failed.
 *
 * @param props - The overview, and each middleware's look
 * @returns The section
 * @example
 * ```tsx
 * <OverheadHero overview={overview} looks={looks} />
 * ```
 */
export function OverheadHero({ overview, looks }: OverheadHeroProps): React.ReactNode {
  const { overhead, perCall, stats, errors } = overview;
  const noticeable = overhead > NOTICEABLE;
  const slowest = [...stats].sort((a, b) => b.avg - a.avg)[0];
  const phases = (["before", "wrap", "after"] as const).map(
    (p) => `${stats.filter((s) => s.phase === p).length} ${p}`,
  );
  const ring = noticeable ? "var(--color-warn)" : "var(--color-brand)";
  return (
    <section
      aria-label="Overhead"
      className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] overflow-hidden rounded-[16px] border border-line bg-panel"
    >
      <div className="-mb-px flex items-center gap-5.5 border-r border-b border-line px-6 py-5.5 max-sm:gap-4.5 max-sm:border-r-0 max-sm:px-4.5">
        <div
          className="relative size-29.5 shrink-0 rounded-full"
          style={{
            background: `conic-gradient(${ring} 0 ${overhead}%, var(--color-raised) ${overhead}% 100%)`,
          }}
        >
          <div className="absolute inset-2.5 flex flex-col items-center justify-center gap-0.5 rounded-full bg-panel">
            <span
              className={cn(
                "font-mono text-hero leading-none font-medium tracking-[-0.045em]",
                noticeable ? "text-warn" : "text-fg",
              )}
            >
              {`${overhead.toFixed(1)}%`}
            </span>
            <span className="text-badge text-fg-subtle">overhead</span>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2.5">
          <span className="text-metric font-semibold tracking-[-0.02em]">
            {noticeable ? "Middleware is noticeable" : "Middleware is lightweight"}
          </span>
          <span className="text-control leading-normal text-pretty text-fg-muted">
            {`${formatDuration(perCall)} per request on average${slowest ? ` — ${slowest.name} is the most expensive step.` : "."}`}
          </span>
          <div
            aria-hidden="true"
            className="flex h-2 max-w-65 gap-0.5 overflow-hidden rounded-[4px]"
          >
            {stats.map((s) => (
              <span
                key={s.name}
                title={`${s.name} · ${(s.share * 100).toFixed(0)}%`}
                className={cn("bg-current", looks.get(s.name)?.tone)}
                style={{ flex: `${s.total} 1 0px` }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-line">
        <Figure
          label="Avg per request"
          value={formatDuration(perCall)}
          sub="across all middleware"
        />
        <Figure
          label="Slowest step"
          value={slowest?.name ?? "—"}
          sub={slowest ? `${formatDuration(slowest.avg)} avg` : ""}
          tone="text-warn"
        />
        <Figure label="Middleware" value={String(stats.length)} sub={phases.join(" · ")} />
        <Figure
          label="Failures"
          value={String(errors)}
          sub="middleware runs that failed"
          tone={errors > 0 ? "text-err" : "text-fg"}
        />
      </div>
    </section>
  );
}
