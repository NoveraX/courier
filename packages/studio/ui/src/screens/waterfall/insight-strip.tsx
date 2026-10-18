import type { LucideIcon } from "lucide-react";
import { Download, Layers, ScanLine, Snail } from "lucide-react";

import { callsAndRequests } from "@/features/requests/own-requests";
import type { WaterfallInsights } from "@/features/waterfall/waterfall-insights";
import { formatDuration } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface Insight {
  icon: LucideIcon;
  tile: string;
  label: string;
  value: string;
  tone: string;
  sub: string;
}

/* A slowest request past a second reads as an error, any other as a warning. */
const SLOW_MS = 1_000;

function insightsOf(figures: WaterfallInsights): Insight[] {
  const slow = figures.slowest;
  const late = slow !== undefined && slow.total > SLOW_MS;
  return [
    {
      icon: ScanLine,
      tile: "bg-brand-dim text-brand",
      label: "Time window",
      value: formatDuration(figures.windowMs),
      tone: "text-fg",
      sub: figures.gaps
        ? `${figures.gaps} ${figures.gaps === 1 ? "gap" : "gaps"} compressed`
        : "continuous",
    },
    {
      icon: Layers,
      tile: "bg-syntax-keyword/12 text-syntax-keyword",
      label: "Peak concurrency",
      value: `${figures.peak} parallel`,
      tone: "text-fg",
      sub: `of ${callsAndRequests(figures.inView, figures.requestsInView)} in view`,
    },
    {
      icon: Snail,
      tile: late ? "bg-err-dim text-err" : "bg-warn-dim text-warn",
      label: "Slowest request",
      value: slow ? formatDuration(slow.total) : "—",
      tone: late ? "text-err" : "text-warn",
      sub: slow?.name ?? "",
    },
    {
      icon: Download,
      tile: "bg-brand-dim text-brand",
      label: "Time in fetch",
      value: figures.fetchShare === undefined ? "—" : `${Math.round(figures.fetchShare * 100)}%`,
      tone: "text-fg",
      sub: "of request time",
    },
  ];
}

/**
 * The four figures over the Waterfall: the window it covers, how many
 * requests ran at once at most, the slowest, and the share spent fetching.
 * On a phone they stay on one row, which scrolls sideways, and on a short
 * screen they take less height, so the chart keeps it.
 *
 * @param props - The figures
 * @returns The strip
 * @example
 * ```tsx
 * <InsightStrip figures={model.insights} />
 * ```
 */
export function InsightStrip({ figures }: { figures: WaterfallInsights }): React.ReactNode {
  return (
    <div className="grid shrink-0 grid-cols-[repeat(auto-fit,minmax(170px,1fr))] border-b border-line max-sm:scroll-row">
      {insightsOf(figures).map(({ icon: Icon, ...insight }) => (
        <div
          key={insight.label}
          className="flex min-w-0 items-center gap-3 border-r border-line py-3 pr-4 pl-5 max-sm:w-44 max-sm:shrink-0 max-sm:gap-2.5 max-sm:py-2.5 max-sm:pr-3 max-sm:pl-4 short-screen:py-2"
        >
          <span
            className={cn(
              "flex size-7.5 shrink-0 items-center justify-center rounded-card",
              insight.tile,
            )}
          >
            <Icon aria-hidden="true" className="size-3.5" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-badge whitespace-nowrap text-fg-subtle">{insight.label}</span>
            <span
              className={cn(
                "truncate font-mono text-title font-medium tracking-[-0.01em]",
                insight.tone,
              )}
            >
              {insight.value}
            </span>
            <span className="truncate text-badge text-fg-subtle">{insight.sub}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
