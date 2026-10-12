import { useMemo, useState } from "react";

import { MEDIA } from "@/design/breakpoints";
import { SearchField } from "@/design/search-field";
import { graphLayoutOf } from "@/features/explorer/graph-layout";
import type { GraphNode } from "@/features/explorer/graph-types";
import { useFirstLoad } from "@/hooks/use-first-load";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useStudioStore } from "@/store";
import { ExplorerEmpty } from "./explorer-empty";
import { ExplorerSkeleton } from "./explorer-skeleton";
import { GraphFlow } from "./graph-flow";
import { GraphLegend } from "./graph-legend";
import { useCallPulses } from "./use-call-pulses";
import { useExplorerModel } from "./use-explorer-model";
import { useExplorerSearch } from "./use-explorer-search";

/**
 * The Explorer's graph: every source, its groups and their endpoints, each
 * edged by its health and showing the metric chosen, on a canvas that
 * pans and zooms, with each call running along its endpoint's branch as it
 * ends. A search lights the endpoints that match; hovering lights a node's
 * branch and shows its figures; a source or a group opens the Endpoints
 * list narrowed to it, an endpoint its panel. Groups inside groups take a
 * column a level; a group's fold control folds it into one card, the calls
 * to what it hides running to that card. On a phone the search takes the
 * bar's width and the legend sits behind a button, leaving the canvas the
 * rest of the screen.
 *
 * @returns The Graph tab
 * @example
 * ```tsx
 * <GraphScreen />
 * ```
 */
export function GraphScreen(): React.ReactNode {
  const model = useExplorerModel();
  const loading = useFirstLoad();
  const phone = useMediaQuery(MEDIA.phone);
  const { q, metric, endpoint, set } = useExplorerSearch();
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const [hover, setHover] = useState<string | undefined>(undefined);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const layout = useMemo(
    () => graphLayoutOf(model, { metric, slowMs, query: q, hover, selected: endpoint, folded }),
    [model, metric, slowMs, q, hover, endpoint, folded],
  );
  const fold = (key: string) =>
    setFolded((now) => {
      const next = new Set(now);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const { pulses, done } = useCallPulses(layout.branches, slowMs);
  if (!model.endpoints.length) {
    return loading.sources ? <ExplorerSkeleton view="graph" /> : <ExplorerEmpty />;
  }
  const open = (node: GraphNode) =>
    node.kind === "endpoint"
      ? set({ endpoint: node.key })
      : set({ q: `${node.key}.` }, "/explorer/endpoints");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-3.5 border-b border-line bg-bg-subtle py-2.5 pr-4 pl-5 max-sm:flex-nowrap max-sm:gap-2 pointer-coarse:py-1.5">
        <SearchField
          value={q}
          onChange={(next) => set({ q: next })}
          placeholder="Highlight endpoints…"
          label="Highlight endpoints"
          className="w-65 max-w-full max-sm:w-auto max-sm:min-w-0 max-sm:flex-1"
        />
        {!phone && <div className="flex-1" />}
        <GraphLegend folded={phone} />
      </div>
      <GraphFlow
        layout={layout}
        calls={{ pulses, onPulseDone: done }}
        onHover={setHover}
        onOpen={open}
        onFold={fold}
      />
    </div>
  );
}
