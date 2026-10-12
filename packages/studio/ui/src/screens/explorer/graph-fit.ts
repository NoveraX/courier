import type { FitViewOptions } from "@xyflow/react";

import type { ElementSize } from "@/hooks/use-element-size";
import { GRAPH_VIEW } from "./graph-view-options";

/* The room the flow leaves on one side for the plain fit's padding, as it reckons it. */
function margin(length: number): number {
  return Math.floor((length - length / (1 + GRAPH_VIEW.fit.padding)) / 2);
}

/* How far a fit with these sides kept free could zoom the graph in. */
function zoomWithin(graph: ElementSize, pane: ElementSize, free: ElementSize): number {
  return Math.min(
    (pane.width - free.width) / graph.width,
    (pane.height - free.height) / graph.height,
  );
}

/**
 * How the graph fits its pane: the plain fit's room on every side, and
 * clear of the zoom controls in the lower left corner — kept beside the
 * graph or below it, whichever leaves the graph the larger. A pane not yet
 * measured fits as plainly as before.
 *
 * @param graph - The layout's width and height
 * @param pane - The pane the graph is drawn in
 * @param controls - The room the controls take from the lower left corner, gap included
 * @returns The fit, for the first view and for the controls' fit button alike
 * @example
 * ```ts
 * graphFit({ width: 1200, height: 300 }, { width: 375, height: 600 }, { width: 65, height: 145 });
 * // → the controls' room kept below the graph, which is wide and the pane tall
 * ```
 */
export function graphFit(
  graph: ElementSize,
  pane: ElementSize,
  controls: ElementSize,
): FitViewOptions {
  if (!(pane.width && pane.height && graph.width && graph.height)) return GRAPH_VIEW.fit;
  const x = margin(pane.width);
  const y = margin(pane.height);
  const left = Math.max(x, controls.width);
  const bottom = Math.max(y, controls.height);
  const beside = zoomWithin(graph, pane, { width: left + x, height: 2 * y });
  const below = zoomWithin(graph, pane, { width: 2 * x, height: y + bottom });
  const sides = beside >= below ? { left, bottom: y } : { left: x, bottom };
  return {
    maxZoom: GRAPH_VIEW.fit.maxZoom,
    padding: {
      top: `${y}px`,
      right: `${x}px`,
      bottom: `${sides.bottom}px`,
      left: `${sides.left}px`,
    },
  };
}
