import { ChartColumn, Download } from "lucide-react";

import { EmptyPanel } from "@/design/empty-panel";
import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import { Skeleton } from "@/design/skeleton";
import type { AnalyticsRange } from "@/features/analytics/analytics-search";
import { successRate } from "@/features/analytics/call-stats";
import { exportShownRequests } from "@/features/sessions/export-requests";
import { useFirstLoad } from "@/hooks/use-first-load";
import { useInspector } from "@/inspector/use-inspector";
import { useStudioStore } from "@/store";
import { AnalyticsSkeleton } from "./analytics-skeleton";
import { EndpointsTable } from "./endpoints-table";
import { KpiStrip } from "./kpi-strip";
import { LatencyChart } from "./latency-chart";
import { RequestsChart } from "./requests-chart";
import { StatusChart } from "./status-chart";
import { useAnalytics } from "./use-analytics";

const RANGES: readonly SegmentedOption<AnalyticsRange>[] = [
  { value: "1m", label: "1 min" },
  { value: "5m", label: "5 min" },
  { value: "session", label: "Session" },
];

const NOTHING_IN: Readonly<Record<AnalyticsRange, string>> = {
  "1m": "No request completed in the last minute",
  "5m": "No request completed in the last 5 minutes",
  session: "No completed requests yet",
};

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function Nothing({ range }: { range: AnalyticsRange }): React.ReactNode {
  return (
    <EmptyPanel icon={ChartColumn} title={NOTHING_IN[range]}>
      {range === "session"
        ? "Analytics charts your app's HTTP calls as they complete: latency, status codes and every endpoint they reach."
        : "Choose a longer range, or make a few calls from your app."}
    </EmptyPanel>
  );
}

/**
 * The Analytics page: the range's headline figures, how response times
 * spread, how calls ended and how they came in over time, and every
 * endpoint they reached — each call one click from the inspector.
 *
 * @returns The page
 * @example
 * ```tsx
 * <AnalyticsScreen />
 * ```
 */
export function AnalyticsScreen(): React.ReactNode {
  const model = useAnalytics();
  const { open } = useInspector();
  const project = useStudioStore((s) => s.studioInfo?.project.name);
  const format = useStudioStore((s) => s.settings.defaultExportFormat);
  const total = useStudioStore((s) => s.requests.length);
  const loading = useFirstLoad();
  const { view, win, endpoints } = model;
  const sub = [
    project,
    ...(win.done.length === win.sent.length ? [] : [plural(win.done.length, "call")]),
    plural(win.sent.length, "completed request"),
    plural(endpoints.length, "endpoint"),
  ];
  return (
    <div className="mx-auto flex min-h-full w-full max-w-360 flex-col gap-4 px-6 pt-6 pb-10 max-sm:px-4 max-sm:pt-4">
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="m-0 text-page font-semibold tracking-[-0.025em]">Analytics</h1>
          {loading.requests ? (
            <Skeleton className="my-0.75 h-3 w-64" />
          ) : (
            <span className="text-control text-fg-subtle">{sub.filter(Boolean).join(" · ")}</span>
          )}
        </div>
        <div className="flex-1" />
        <div className="flex min-w-0 items-end gap-4 max-sm:w-full max-sm:items-center">
          <div className="scroll-row min-w-0 max-sm:flex-1">
            <Segmented
              label="Range"
              options={RANGES}
              value={view.range}
              onChange={(range) => model.change({ ...view, range })}
            />
          </div>
          <button
            type="button"
            title={`Export the requests as ${format.toUpperCase()}`}
            disabled={total === 0}
            onClick={() => void exportShownRequests(format)}
            className="flex h-7.5 shrink-0 cursor-pointer items-center gap-1.75 rounded-control border border-line bg-panel px-2.75 text-control text-fg-muted hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-50 pointer-coarse:h-9"
          >
            <Download aria-hidden="true" className="size-3.25" />
            Export
          </button>
        </div>
      </header>
      {loading.requests ? (
        <AnalyticsSkeleton />
      ) : win.done.length === 0 ? (
        <Nothing range={view.range} />
      ) : (
        <>
          <KpiStrip figures={model.kpis} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-2.5">
            <LatencyChart latency={model.latency} />
            <StatusChart
              groups={model.statuses}
              total={win.sent.length}
              successRate={successRate(win.sent) ?? 0}
            />
            <RequestsChart series={model.series} span={win.span} saved={model.saved} />
          </div>
          <EndpointsTable
            rows={endpoints}
            view={view}
            slowMs={model.slowMs}
            onView={model.change}
            onOpenCall={open}
          />
        </>
      )}
    </div>
  );
}
