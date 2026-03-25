import { useMemo } from "react";
import { useStudioStore } from "@/store";
import type { Catalog, RequestEntry } from "@/store/types";
import type {
  SourceNodeData,
  GroupNodeData,
  EndpointNodeData,
  ExplorerEdgeData,
} from "./types";
import { buildExplorerData } from "./build-explorer-data";

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
  const catalog = useStudioStore((s) => s.catalog);
  const requests = useStudioStore((s) => s.requests);

  return useMemo(() => {
    const sourceMap = augmentFromRequests(catalog, requests);
    return buildExplorerData(sourceMap, requests);
  }, [catalog, requests]);
}

// ── Fill gaps from requests (pure direct mode without session) ──────────────

function augmentFromRequests(catalog: Catalog, requests: RequestEntry[]): Catalog {
  let cloned: Catalog | null = null;

  for (const req of requests) {
    if (!req.source) continue;
    const grpName = req.group ?? "";

    if (catalog[req.source]?.groups[grpName]?.endpoints[req.method]) continue;

    // Lazily clone to avoid mutating the store
    if (!cloned) cloned = structuredClone(catalog);

    if (!cloned[req.source]) {
      cloned[req.source] = { baseURL: extractBaseURL(req.url), groups: {} };
    }

    if (!cloned[req.source].groups[grpName]) {
      cloned[req.source].groups[grpName] = {
        prefix: grpName ? `/${grpName}` : "",
        endpoints: {},
      };
    }

    if (!cloned[req.source].groups[grpName].endpoints[req.method]) {
      cloned[req.source].groups[grpName].endpoints[req.method] = {
        type: req.type ?? "query",
        hasVariablesSchema: req.hasValidation?.variables ?? false,
        hasResponseSchema: req.hasValidation?.response ?? false,
        origin: "runtime",
      };
    }
  }

  return cloned ?? catalog;
}

function extractBaseURL(url: string | undefined): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "";
  }
}
