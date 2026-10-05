import { useMemo } from "react";

import { barOf } from "@/features/waterfall/bar-segments";
import type { GapMark, TimeTick } from "@/features/waterfall/time-ticks";
import { gapMarksOf, timeTicksOf } from "@/features/waterfall/time-ticks";
import type { TimeWindow, TrackScale } from "@/features/waterfall/time-window";
import { autoZoomOf, timeWindowOf, trackScaleOf } from "@/features/waterfall/time-window";
import type { WaterfallInsights } from "@/features/waterfall/waterfall-insights";
import { waterfallInsights } from "@/features/waterfall/waterfall-insights";
import { requestsInView, streamsInView } from "@/features/waterfall/waterfall-items";
import type { WaterfallRow } from "@/features/waterfall/waterfall-rows";
import { waterfallRows } from "@/features/waterfall/waterfall-rows";
import type { WaterfallView } from "@/features/waterfall/waterfall-search";
import { useNow } from "@/hooks/use-tick";
import { useStudioStore } from "@/store";

/** Everything the Waterfall draws, worked out from the requests and the view. */
export interface WaterfallModel {
  rows: WaterfallRow[];
  window: TimeWindow;
  scale: TrackScale;
  ticks: TimeTick[];
  gaps: GapMark[];
  insights: WaterfallInsights;
  /** The requests and streams in view, and all the requests captured. */
  shown: number;
  total: number;
  labelPx: number;
  zoom: number;
  /** The ids of the requests in view, which the Waterfall holds when it stops following. */
  inView: string[];
  now: number;
}

/** What the model is worked out from, beside the requests. */
export interface WaterfallInput {
  view: WaterfallView;
  held: ReadonlySet<string> | undefined;
  zoom: number | null;
  width: number;
  closed: ReadonlySet<string>;
}

/**
 * The Waterfall's model: the requests in view and their bars, the window
 * they span with its idle gaps, the scale at the zoom asked for — or the
 * one that draws a typical request legibly — its marks, rows and figures.
 *
 * @param input - The view, the held requests, the zoom, the width and the closed headers
 * @returns The model
 * @example
 * ```ts
 * const model = useWaterfall({ view, held, zoom: null, width: 1180, closed });
 * ```
 */
export function useWaterfall(input: WaterfallInput): WaterfallModel {
  const { view, held, zoom: asked, width, closed } = input;
  const requests = useStudioStore((s) => s.requests);
  const now = useNow();
  return useMemo(() => {
    const scope = { q: view.q, mode: view.mode, held };
    const items = requestsInView(requests, scope).map((request) => ({
      request,
      bar: barOf(request, now),
    }));
    const spans = items.map(({ request, bar }) => ({
      start: request.startedAt,
      end: request.startedAt + bar.total,
    }));
    const window = timeWindowOf(spans, now);
    const streams = streamsInView(requests, scope, window.start, now);
    const labelPx = Math.round(Math.min(320, Math.max(240, width * 0.32)));
    const contentPx = Math.max(280, width - labelPx);
    const zoom = asked ?? autoZoomOf(spans, contentPx);
    const scale = trackScaleOf(window, Math.round(contentPx * zoom));
    return {
      rows: waterfallRows({ items, streams, sort: view.sort, group: view.group, closed }),
      window,
      scale,
      ticks: timeTicksOf(window, scale),
      gaps: gapMarksOf(window, scale),
      insights: waterfallInsights(items, window),
      shown: items.length + streams.length,
      total: requests.length,
      labelPx,
      zoom,
      inView: items.map((i) => i.request.id),
      now,
    };
  }, [requests, now, view, held, asked, width, closed]);
}
