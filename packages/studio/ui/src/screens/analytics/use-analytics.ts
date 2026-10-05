import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";

import type { AnalyticsSearch, AnalyticsView } from "@/features/analytics/analytics-search";
import { analyticsSearch, analyticsView } from "@/features/analytics/analytics-search";
import type { AnalyticsWindow } from "@/features/analytics/analytics-window";
import { analyticsWindow } from "@/features/analytics/analytics-window";
import type { EndpointRow } from "@/features/analytics/endpoint-rows";
import { endpointRows, sortEndpointRows } from "@/features/analytics/endpoint-rows";
import type { KpiFigure } from "@/features/analytics/kpi-figures";
import { kpiFigures } from "@/features/analytics/kpi-figures";
import type { LatencyBins } from "@/features/analytics/latency-bins";
import { latencyBins } from "@/features/analytics/latency-bins";
import type { RequestSeries } from "@/features/analytics/request-series";
import { requestSeries } from "@/features/analytics/request-series";
import type { StatusGroup } from "@/features/analytics/status-breakdown";
import { statusBreakdown } from "@/features/analytics/status-breakdown";
import { shownNow } from "@/features/sessions/shown-now";
import { useNow } from "@/hooks/use-tick";
import { useStudioStore } from "@/store";

/** Everything Analytics shows, worked out from the requests and the view. */
export interface AnalyticsModel {
  view: AnalyticsView;
  win: AnalyticsWindow;
  kpis: KpiFigure[];
  latency: LatencyBins;
  statuses: StatusGroup[];
  series: RequestSeries;
  /** The endpoints, in the order the view sorts them. */
  endpoints: EndpointRow[];
  slowMs: number;
  /** Whether a saved session shows, whose window ends where it ended rather than now. */
  saved: boolean;
  /** Shows another view: a range, a sort. */
  change: (next: AnalyticsView) => void;
}

/**
 * Analytics' model: the finished calls of the range the address names,
 * and every figure, chart and row drawn from them — kept fresh as calls
 * arrive and as the range slides with time; a saved session's range ends
 * where the session did.
 *
 * @returns The model
 * @example
 * ```ts
 * const { kpis, endpoints } = useAnalytics();
 * ```
 */
export function useAnalytics(): AnalyticsModel {
  const search: AnalyticsSearch = useSearch({ from: "/next/analytics" });
  const navigate = useNavigate({ from: "/next/analytics" });
  const requests = useStudioStore((s) => s.requests);
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const saved = useStudioStore((s) => s.shownSession !== null);
  const clock = useNow();
  const now = shownNow(requests, clock, saved);
  const view = analyticsView(search);
  const figures = useMemo(() => {
    const win = analyticsWindow(requests, view.range, now);
    return {
      win,
      kpis: kpiFigures(win, view.range, slowMs),
      latency: latencyBins(win.done, slowMs),
      statuses: statusBreakdown(win.done),
      series: requestSeries(win),
      rows: endpointRows(win.done),
    };
  }, [requests, view.range, now, slowMs]);
  const { rows, ...rest } = figures;
  const change = (next: AnalyticsView): void =>
    void navigate({
      search: (prev) => ({ req: prev.req, tab: prev.tab, ...analyticsSearch(next) }),
      replace: true,
    });
  return {
    ...rest,
    view,
    endpoints: sortEndpointRows(rows, view.sort, view.dir),
    slowMs,
    saved,
    change,
  };
}
