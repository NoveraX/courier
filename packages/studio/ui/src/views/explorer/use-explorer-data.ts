import { useMemo } from "react";
import { useCatalog } from "@/hooks/use-catalog";
import { useStudioStore } from "@/store";
import { buildExplorerData } from "./build-explorer-data";
import type { EndpointNodeData, ExplorerEdgeData, GroupNodeData, SourceNodeData } from "./types";

// ── Result type ─────────────────────────────────────────────────────────────

export interface ExplorerData {
  sources: SourceNodeData[];
  groups: GroupNodeData[];
  endpoints: EndpointNodeData[];
  edges: ExplorerEdge[];
  isEmpty: boolean;
}

export interface ExplorerEdge {
  id: string;
  source: string;
  target: string;
  data: ExplorerEdgeData;
}

// ── Hook ────────────────────────────────────────────────────────────────────

/**
 * The Explorer's sources, groups, endpoints and edges: the API the config
 * declares, merged with what traffic showed, each with its metrics.
 *
 * @returns The nodes and edges to draw
 *
 * @example
 * ```tsx
 * const { sources, endpoints, isEmpty } = useExplorerData();
 * ```
 */
export function useExplorerData(): ExplorerData {
  const requests = useStudioStore((s) => s.requests);
  const catalog = useCatalog();

  return useMemo(() => buildExplorerData(catalog, requests), [catalog, requests]);
}
