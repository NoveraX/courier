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

export function useExplorerData(): ExplorerData {
  const requests = useStudioStore((s) => s.requests);

  return useMemo(() => {
    const sourceMap = buildCatalogFromRequests(requests);
    return buildExplorerData(sourceMap, requests);
  }, [requests]);
}
