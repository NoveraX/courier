import type { FitViewOptions } from "@xyflow/react";
import { useMemo } from "react";

import { MEDIA } from "@/design/breakpoints";
import type { GraphLayout } from "@/features/explorer/graph-types";
import { useElementSize } from "@/hooks/use-element-size";
import { useMediaQuery } from "@/hooks/use-media-query";
import { CONTROLS_ROOM } from "./graph-controls";
import { graphFit } from "./graph-fit";

/**
 * How the graph fits the pane it is drawn in — {@link graphFit} for the
 * pane's size as it is now, and for the controls as large as a mouse or a
 * finger has them.
 *
 * @param pane - The pane the graph is drawn in
 * @param layout - The graph's layout
 * @returns The fit, for the first view and for the controls' fit button alike
 * @example
 * ```tsx
 * const fit = useGraphFit(paneRef, layout);
 * <ReactFlow fitView fitViewOptions={fit} />
 * ```
 */
export function useGraphFit(
  pane: React.RefObject<HTMLElement | null>,
  layout: GraphLayout,
): FitViewOptions {
  const size = useElementSize(pane);
  const coarse = useMediaQuery(MEDIA.coarse);
  const { width, height } = layout;
  return useMemo(
    () => graphFit({ width, height }, size, CONTROLS_ROOM[coarse ? "coarse" : "fine"]),
    [width, height, size, coarse],
  );
}
