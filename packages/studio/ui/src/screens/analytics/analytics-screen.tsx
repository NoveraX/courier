import { ChartColumn, Download } from "lucide-react";

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
    <div className="flex flex-col items-center justify-center gap-2 rounded-dialog border border-line bg-panel px-6 py-16 text-center">
      <ChartColumn aria-hidden="true" className="size-5 text-fg-subtle" />
      <p className="m-0 text-ui font-strong">{NOTHING_IN[range]}</p>
      <p className="m-0 max-w-90 text-small text-fg-subtle">
        {range === "session"
          ? "Analytics charts your app's HTTP calls as they complete: latency, status codes and every endpoint they reach."
          : "Choose a longer range, or make a few calls from your app."}
      </p>
    </div>
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
    plural(win.done.length, "completed request"),
    plural(endpoints.length, "endpoint"),
  ];
  return (
    <div className="mx-auto flex w-full max-w-360 flex-col gap-4 px-6 pt-6 pb-10">
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
        <Segmented
          label="Range"
          options={RANGES}
          value={view.range}
          onChange={(range) => model.change({ ...view, range })}
        />
        <button
          type="button"
          title={`Export the requests as ${format.toUpperCase()}`}
          disabled={total === 0}
          onClick={() => void exportShownRequests(format)}
          className="flex h-7.5 cursor-pointer items-center gap-1.75 rounded-control border border-line bg-panel px-2.75 text-control text-fg-muted hover:border-line-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-default disabled:opacity-50"
        >
          <Download aria-hidden="true" className="size-3.25" />
          Export
        </button>
      </header>
      {loading.requests ? (
        <AnalyticsSkeleton />
      ) : win.done.length === 0 ? (
        <Nothing range={view.range} />
      ) : (
        <>
          <KpiStrip figures={model.kpis} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-2.5">
            <LatencyChart latency={model.latency} />
            <StatusChart
              groups={model.statuses}
              total={win.done.length}
              successRate={successRate(win.done) ?? 0}
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
