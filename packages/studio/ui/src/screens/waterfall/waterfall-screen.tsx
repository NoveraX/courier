import { useCallback, useEffect, useState } from "react";

import { useFirstLoad } from "@/hooks/use-first-load";
import { useInspector } from "@/inspector/use-inspector";
import { InsightStrip } from "./insight-strip";
import { useChartWidth } from "./use-chart-width";
import { useWaterfall } from "./use-waterfall";
import { useWaterfallView } from "./use-waterfall-view";
import { WaterfallChart } from "./waterfall-chart";
import { WaterfallLegend } from "./waterfall-legend";
import { WaterfallSkeleton } from "./waterfall-skeleton";
import { WaterfallToolbar } from "./waterfall-toolbar";

/* A zoom step multiplies or divides the zoom by this, between 1× and 10×. */
const ZOOM_STEP = 1.5;

/* The chart's width until it is measured: no wider than the window, which a
   phone's chart fills, so its rows name their requests over their bars from
   the first frame. */
function firstWidth(): number {
  return typeof window === "undefined" ? 1180 : Math.min(1180, window.innerWidth);
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/**
 * The Waterfall: the newest requests on one time scale — their phases,
 * the caller's legs of a proxied call, the streams open meanwhile — with
 * idle stretches compressed, its figures over it and its key under it. It
 * follows new traffic until told to hold still, zooms with − 0 +, and opens
 * a request in the inspector on a click.
 *
 * @returns The screen
 * @example
 * ```tsx
 * <WaterfallScreen />
 * ```
 */
export function WaterfallScreen(): React.ReactNode {
  const { view, setView } = useWaterfallView();
  const { requestId, open, close } = useInspector();
  const [width, chartRef] = useChartWidth(firstWidth());
  const [held, setHeld] = useState<ReadonlySet<string> | undefined>(undefined);
  const [zoom, setZoom] = useState<number | null>(null);
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set());
  const model = useWaterfall({ view, held, zoom, width, closed });
  const loading = useFirstLoad();
  const zoomTo = useCallback(
    (step: "in" | "out" | "fit") => {
      if (step === "fit") return setZoom(null);
      const next = step === "in" ? model.zoom * ZOOM_STEP : model.zoom / ZOOM_STEP;
      setZoom(Math.min(10, Math.max(1, Math.round(next * 100) / 100)));
    },
    [model.zoom],
  );
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (event.key === "+" || event.key === "=") zoomTo("in");
      else if (event.key === "-") zoomTo("out");
      else if (event.key === "0") zoomTo("fit");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomTo]);
  const toggleGroup = (key: string) =>
    setClosed((now) => {
      const next = new Set(now);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <WaterfallToolbar
        view={view}
        onView={setView}
        shown={model.shown}
        total={model.total}
        following={held === undefined}
        onFollow={() => setHeld((now) => (now ? undefined : new Set(model.inView)))}
        zoomLabel={zoom === null ? "Auto" : `${model.zoom.toFixed(1)}×`}
        onZoom={zoomTo}
      />
      {loading.requests ? (
        <WaterfallSkeleton />
      ) : (
        <>
          <InsightStrip figures={model.insights} />
          <WaterfallChart
            ref={chartRef}
            model={model}
            visiblePx={width}
            selectedId={requestId}
            onSelect={(id) => (id === requestId ? close() : open(id))}
            onToggle={toggleGroup}
          />
        </>
      )}
      <WaterfallLegend webhooks={model.webhooks} />
    </div>
  );
}
