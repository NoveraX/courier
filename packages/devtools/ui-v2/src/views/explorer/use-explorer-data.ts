import { useMemo } from "react";
import { useDevToolsStore } from "@/store";
import type { RequestEntry, SourceMap } from "@/store/types";
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
  const sessions = useDevToolsStore((s) => s.sessions);
  const requests = useDevToolsStore((s) => s.requests);

  return useMemo(() => {
    const { sourceMap, canonicalNames } = mergeSessions(
      sessions.map((s) => s.sources),
    );

    const normalized = normalizeRequests(requests, canonicalNames, sourceMap);
    augmentFromRequests(sourceMap, normalized);
    return buildExplorerData(sourceMap, normalized);
  }, [sessions, requests]);
}

// ── Merge sessions — case-insensitive dedup across processes ────────────────

/**
 * Server and client connectDevTools instances register the same API source
 * under different keys (e.g. "jsonPlaceholder" vs "jsonplaceholder").
 * HMR can also create "_N" suffixed duplicates.
 * Merge them into one canonical entry — first occurrence wins.
 */
function mergeSessions(maps: SourceMap[]): {
  sourceMap: SourceMap;
  canonicalNames: Map<string, string>;
} {
  const merged: SourceMap = {};
  const canonByLower = new Map<string, string>();
  const canonicalNames = new Map<string, string>();

  for (const map of maps) {
    for (const [srcName, srcInfo] of Object.entries(map)) {
      const baseLower = stripNumericSuffix(srcName).toLowerCase();
      const canonical = canonByLower.get(baseLower)
        ?? canonByLower.get(srcName.toLowerCase());

      if (canonical) {
        if (srcName !== canonical) canonicalNames.set(srcName, canonical);
        deepMergeSource(merged[canonical], srcInfo);
      } else {
        canonByLower.set(baseLower, srcName);
        canonByLower.set(srcName.toLowerCase(), srcName);
        merged[srcName] = { baseURL: srcInfo.baseURL, groups: {} };
        deepMergeSource(merged[srcName], srcInfo);
      }
    }
  }

  return { sourceMap: merged, canonicalNames };
}

/** Strip trailing `_N` suffix from HMR-duplicated source keys */
function stripNumericSuffix(name: string): string {
  return name.replace(/_\d+$/, "");
}

function deepMergeSource(
  dst: SourceMap[string],
  src: SourceMap[string],
): void {
  if (!dst.baseURL && src.baseURL) dst.baseURL = src.baseURL;

  for (const [grpName, grpInfo] of Object.entries(src.groups)) {
    if (!dst.groups[grpName]) {
      dst.groups[grpName] = { prefix: grpInfo.prefix, endpoints: {} };
    }
    const dstGrp = dst.groups[grpName];

    for (const [epName, epInfo] of Object.entries(grpInfo.endpoints)) {
      if (!dstGrp.endpoints[epName]) {
        dstGrp.endpoints[epName] = epInfo;
      }
    }
  }
}

// ── Normalize request source names ──────────────────────────────────────────

/**
 * Remap request.source to the canonical sourceMap key.
 * Uses canonicalNames from mergeSessions + case-insensitive fallback
 * against sourceMap keys to catch single-session case mismatches.
 */
function normalizeRequests(
  requests: RequestEntry[],
  canonicalNames: Map<string, string>,
  sourceMap: SourceMap,
): RequestEntry[] {
  // Build case-insensitive lookup from both aliases and sourceMap keys
  const byLower = new Map<string, string>();
  for (const key of Object.keys(sourceMap)) {
    byLower.set(key.toLowerCase(), key);
  }
  for (const [alias, canonical] of canonicalNames) {
    byLower.set(alias.toLowerCase(), canonical);
    byLower.set(canonical.toLowerCase(), canonical);
  }

  let changed = false;
  const result = requests.map((r) => {
    const direct = canonicalNames.get(r.source);
    if (direct) { changed = true; return { ...r, source: direct }; }

    if (sourceMap[r.source]) return r;

    const byCase = byLower.get(r.source.toLowerCase());
    if (byCase && byCase !== r.source) { changed = true; return { ...r, source: byCase }; }

    return r;
  });

  return changed ? result : requests;
}

// ── Fill gaps from requests (pure direct mode without session) ──────────────

function augmentFromRequests(
  sourceMap: SourceMap,
  requests: RequestEntry[],
): void {
  for (const req of requests) {
    if (!req.source) continue;
    const grpName = req.group ?? "";

    if (sourceMap[req.source]?.groups[grpName]?.endpoints[req.method]) continue;

    if (!sourceMap[req.source]) {
      sourceMap[req.source] = { baseURL: extractBaseURL(req.url), groups: {} };
    }
    const src = sourceMap[req.source];

    if (!src.groups[grpName]) {
      src.groups[grpName] = { prefix: grpName ? `/${grpName}` : "", endpoints: {} };
    }

    if (!src.groups[grpName].endpoints[req.method]) {
      src.groups[grpName].endpoints[req.method] = {
        type: req.type ?? "query",
        hasVariablesSchema: req.hasValidation?.variables ?? false,
        hasResponseSchema: req.hasValidation?.response ?? false,
        middleware: [],
      };
    }
  }
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
