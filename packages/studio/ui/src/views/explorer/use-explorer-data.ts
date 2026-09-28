import { useMemo } from "react";
import { useStudioStore } from "@/store";
import type {
  SourceNodeData,
  GroupNodeData,
  EndpointNodeData,
  ExplorerEdgeData,
} from "./types";
import { buildExplorerData } from "./build-explorer-data";
import { buildCatalogFromRequests } from "@/store/build-catalog-from-requests";
import { buildCatalogFromScan } from "@/store/build-catalog-from-scan";
import { mergeCatalogs } from "@/store/merge-catalogs";

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
  const declared = useStudioStore((s) => s.scanSources);

  return useMemo(() => {
    const sourceMap = mergeCatalogs(buildCatalogFromScan(declared), buildCatalogFromRequests(requests));
    return buildExplorerData(sourceMap, requests);
  }, [declared, requests]);
}
