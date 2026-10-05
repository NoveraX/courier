import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";

import type { EndpointKind, ExplorerSearch } from "@/features/explorer/explorer-search";
import { validateExplorerSearch } from "@/features/explorer/explorer-search";
import type { ColorMetric } from "@/features/explorer/metric-value";

/** The Explorer's tabs, by the address each lives at. */
export type ExplorerTab =
  | "/explorer"
  | "/explorer/overview"
  | "/explorer/endpoints"
  | "/explorer/heatmap";

/** The Explorer's parameters with their defaults filled in, and what changes them. */
export interface ExplorerSearchControl {
  q: string;
  metric: ColorMetric;
  kind: EndpointKind;
  endpoint: string | undefined;
  /** Change some of them, on this tab or another. */
  set: (patch: ExplorerSearch, tab?: ExplorerTab) => void;
}

/**
 * The Explorer's search, colour metric, kind and open endpoint as its
 * address keeps them — shared by its tabs, so a search made on the Graph
 * carries over to the Endpoints list — with the inspector's request kept
 * alongside.
 *
 * @returns The parameters, and what changes them
 * @example
 * ```ts
 * const { q, set } = useExplorerSearch();
 * set({ q: "api.orders." }, "/explorer/endpoints");
 * ```
 */
export function useExplorerSearch(): ExplorerSearchControl {
  const search = useSearch({ from: "/explorer" });
  const navigate = useNavigate();
  const set = useCallback(
    (patch: ExplorerSearch, tab?: ExplorerTab) =>
      void navigate({
        to: tab ?? ".",
        search: (prev) => ({
          ...prev,
          q: undefined,
          metric: undefined,
          kind: undefined,
          endpoint: undefined,
          ...validateExplorerSearch({ ...prev, ...patch }),
        }),
        replace: tab === undefined && !("endpoint" in patch),
      }),
    [navigate],
  );
  return {
    q: search.q ?? "",
    metric: search.metric ?? "latency",
    kind: search.kind ?? "all",
    endpoint: search.endpoint,
    set,
  };
}
