import { useMemo, useState } from "react";

import { SearchField } from "@/design/search-field";
import type { HealthLevel } from "@/features/explorer/endpoint-metrics";
import { LEVEL_META } from "@/features/explorer/endpoint-metrics";
import { graphLayoutOf } from "@/features/explorer/graph-layout";
import type { GraphNode } from "@/features/explorer/graph-types";
import { useFirstLoad } from "@/hooks/use-first-load";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { ExplorerEmpty } from "./explorer-empty";
import { ExplorerSkeleton } from "./explorer-skeleton";
import { GraphFlow } from "./graph-flow";
import { LEVEL_EDGE } from "./level-edge";
import { useCallPulses } from "./use-call-pulses";
import { useExplorerModel } from "./use-explorer-model";
import { useExplorerSearch } from "./use-explorer-search";

const LEVELS: readonly HealthLevel[] = ["healthy", "degraded", "critical", "idle"];

function Legend(): React.ReactNode {
  return (
    <ul aria-label="Legend" className="flex flex-wrap items-center gap-3.5">
      {LEVELS.map((level) => (
        <li
          key={level}
          className="flex items-center gap-1.5 text-label whitespace-nowrap text-fg-muted"
        >
          <span
            aria-hidden="true"
            className={cn(
              "h-2.5 w-3.5 rounded-[3px] border bg-panel",
              LEVEL_EDGE[LEVEL_META[level].tone],
            )}
          />
          {LEVEL_META[level].label}
        </li>
      ))}
      <li className="flex items-center gap-1.5 text-label whitespace-nowrap text-fg-muted">
        <span className="relative h-px w-4.5 bg-gradient-to-r from-transparent to-brand">
          <span className="absolute top-1/2 right-0 size-1.5 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_6px_var(--color-brand)]" />
        </span>
        Live call
      </li>
    </ul>
  );
}

/**
 * The Explorer's graph: every source, its groups and their endpoints, each
 * edged by its health and showing the metric chosen, on a canvas that
 * pans and zooms, with each call running along its endpoint's branch as it
 * ends. A search lights the endpoints that match; hovering lights a node's
 * branch and shows its figures; a source or a group opens the Endpoints
 * list narrowed to it, an endpoint its panel. Groups inside groups take a
 * column a level; a group's fold control folds it into one card, the calls
 * to what it hides running to that card.
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
      <div className="flex shrink-0 flex-wrap items-center gap-3.5 border-b border-line bg-bg-subtle py-2.5 pr-4 pl-5">
        <SearchField
          value={q}
          onChange={(next) => set({ q: next })}
          placeholder="Highlight endpoints…"
          label="Highlight endpoints"
          className="w-65 max-w-full"
        />
        <div className="flex-1" />
        <Legend />
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
