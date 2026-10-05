import { useMemo, useState } from "react";

import { SearchField } from "@/design/search-field";
import { TONE_FILL } from "@/design/tone";
import type { HealthLevel } from "@/features/explorer/endpoint-metrics";
import { LEVEL_META } from "@/features/explorer/endpoint-metrics";
import { graphLayoutOf } from "@/features/explorer/graph-layout";
import type { GraphNode } from "@/features/explorer/graph-types";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/store";
import { ExplorerEmpty } from "./explorer-empty";
import { GraphCanvas } from "./graph-canvas";
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
          <span className={cn("size-1.75 rounded-full", TONE_FILL[LEVEL_META[level].tone])} />
          {LEVEL_META[level].label}
        </li>
      ))}
      <li className="flex items-center gap-1.5 text-label whitespace-nowrap text-fg-muted">
        <span className="h-0 w-4.5 border-t-2 border-dashed border-brand" />
        Live traffic
      </li>
    </ul>
  );
}

/**
 * The Explorer's graph: every source, its groups and their endpoints, each
 * coloured by its health and showing the metric chosen. A search lights the
 * endpoints that match; hovering lights a node's branch; a source or a
 * group opens the Endpoints list narrowed to it, an endpoint its panel.
 *
 * @returns The Graph tab
 * @example
 * ```tsx
 * <GraphScreen />
 * ```
 */
export function GraphScreen(): React.ReactNode {
  const model = useExplorerModel();
  const { q, metric, endpoint, set } = useExplorerSearch();
  const slowMs = useStudioStore((s) => s.settings.slowRequestThreshold);
  const [hover, setHover] = useState<string | undefined>(undefined);
  const layout = useMemo(
    () => graphLayoutOf(model, { metric, slowMs, query: q, hover, selected: endpoint }),
    [model, metric, slowMs, q, hover, endpoint],
  );
  if (!model.endpoints.length) return <ExplorerEmpty />;
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
      <GraphCanvas layout={layout} onHover={setHover} onOpen={open} />
    </div>
  );
}
