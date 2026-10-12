/**
 * How the Explorer's graph fits its pane: the plain fit's room on every
 * side, and the lower left corner the zoom controls take kept clear —
 * beside the graph or below it, whichever leaves the graph the larger.
 */
import type { FitViewOptions } from "@xyflow/react";
import { getViewportForBounds } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import { CONTROLS_ROOM } from "@/screens/explorer/graph-controls";
import { graphFit } from "@/screens/explorer/graph-fit";
import { GRAPH_VIEW } from "@/screens/explorer/graph-view-options";

type Size = { width: number; height: number };

/* Where the flow puts the graph's lower left corner on screen for a fit, and at what zoom. */
function corner(
  graph: Size,
  pane: Size,
  fit: FitViewOptions,
): { x: number; y: number; zoom: number } {
  const { x, y, zoom } = getViewportForBounds(
    { x: 0, y: 0, ...graph },
    pane.width,
    pane.height,
    GRAPH_VIEW.zoom.min,
    fit.maxZoom ?? GRAPH_VIEW.zoom.max,
    fit.padding ?? 0,
  );
  return { x, y: y + graph.height * zoom, zoom };
}

describe("graphFit", () => {
  it("keeps the controls' room below a wide graph on a phone held upright", () => {
    const fit = graphFit(
      { width: 1200, height: 300 },
      { width: 375, height: 600 },
      CONTROLS_ROOM.coarse,
    );

    expect(fit.padding).toEqual({ top: "22px", right: "13px", bottom: "145px", left: "13px" });
  });

  it("keeps the controls' room beside a tall graph in a wide window", () => {
    const fit = graphFit(
      { width: 400, height: 1600 },
      { width: 1200, height: 700 },
      CONTROLS_ROOM.fine,
    );

    expect(fit.padding).toEqual({ top: "25px", right: "44px", bottom: "25px", left: "53px" });
  });

  it("never sets the graph's lower left corner where the controls are", () => {
    const graphs: Size[] = [
      { width: 1200, height: 300 },
      { width: 804, height: 1500 },
      { width: 400, height: 1600 },
      { width: 2400, height: 2400 },
      { width: 300, height: 120 },
    ];
    const panes: Size[] = [
      { width: 375, height: 600 },
      { width: 844, height: 300 },
      { width: 1200, height: 700 },
      { width: 768, height: 900 },
    ];
    for (const room of [CONTROLS_ROOM.fine, CONTROLS_ROOM.coarse])
      for (const graph of graphs)
        for (const pane of panes) {
          const { x, y } = corner(graph, pane, graphFit(graph, pane, room));

          const clear = x >= room.width - 1 || y <= pane.height - room.height + 1;
          expect({ graph, pane, room, clear }).toEqual({ graph, pane, room, clear: true });
        }
  });

  it("chooses the side that leaves the graph the larger", () => {
    const graph = { width: 1200, height: 300 };
    const pane = { width: 375, height: 600 };
    const room = CONTROLS_ROOM.coarse;

    const chosen = corner(graph, pane, graphFit(graph, pane, room)).zoom;
    const beside = corner(graph, pane, {
      maxZoom: 1,
      padding: { top: "22px", right: "13px", bottom: "22px", left: `${room.width}px` },
    }).zoom;

    expect(chosen).toBeGreaterThan(beside);
  });

  it("never zooms the graph larger than life", () => {
    expect(
      graphFit({ width: 200, height: 100 }, { width: 1200, height: 700 }, CONTROLS_ROOM.fine)
        .maxZoom,
    ).toBe(1);
  });

  it("fits as plainly as before until the pane has been measured", () => {
    expect(
      graphFit({ width: 1200, height: 300 }, { width: 0, height: 0 }, CONTROLS_ROOM.fine),
    ).toBe(GRAPH_VIEW.fit);
  });
});
