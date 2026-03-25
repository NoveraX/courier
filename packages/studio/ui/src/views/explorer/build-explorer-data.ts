import type { RequestEntry, SourceMap, SourceInfo, GroupInfo, EndpointInfo } from "@/store/types";
import type {
  SourceNodeData,
  GroupNodeData,
  EndpointNodeData,
  NodeMetrics,
  EdgeTier,
} from "./types";
import type { ExplorerData, ExplorerEdge } from "./use-explorer-data";
import { computeNodeMetrics } from "./compute-metrics";
import { filterRequests, resolveFullPath, inferHttpMethod } from "./helpers";

// ── Builder ─────────────────────────────────────────────────────────────────

export function buildExplorerData(
  sourceMap: SourceMap,
  requests: RequestEntry[],
): ExplorerData {
  const sources: SourceNodeData[] = [];
  const groups: GroupNodeData[] = [];
  const endpoints: EndpointNodeData[] = [];
  const edges: ExplorerEdge[] = [];

  for (const [srcName, srcInfo] of Object.entries(sourceMap)) {
    const srcRequests = filterRequests(requests, srcName);
    const realGroups = Object.keys(srcInfo.groups).filter((g) => g !== "");

    sources.push({
      name: srcName,
      baseURL: srcInfo.baseURL,
      groupCount: realGroups.length,
      endpointCount: countEndpoints(srcInfo),
      metrics: computeNodeMetrics(srcRequests),
    });

    for (const [grpName, grpInfo] of Object.entries(srcInfo.groups)) {
      if (grpName === "") {
        // Flat endpoints — connect directly to source, no group node
        buildFlatEndpoints(srcName, grpInfo, sourceMap, requests, endpoints, edges);
      } else {
        buildGroup(srcName, grpName, grpInfo, sourceMap, requests, groups, endpoints, edges);
      }
    }
  }

  return { sources, groups, endpoints, edges, isEmpty: sources.length === 0 };
}

// ── Flat endpoints (no group) ──────────────────────────────────────────────

function buildFlatEndpoints(
  srcName: string,
  grpInfo: GroupInfo,
  sourceMap: SourceMap,
  requests: RequestEntry[],
  endpoints: EndpointNodeData[],
  edges: ExplorerEdge[],
): void {
  for (const [epName, epInfo] of Object.entries(grpInfo.endpoints)) {
    const ep = buildEndpoint(srcName, "", epName, epInfo, sourceMap, requests);
    endpoints.push(ep.data);
    // Connect directly to source — no intermediate group
    edges.push(makeEdge(`source:${srcName}`, ep.nodeId, ep.data.metrics, "source-to-endpoint"));
  }
}

// ── Group builder ───────────────────────────────────────────────────────────

function buildGroup(
  srcName: string,
  grpName: string,
  grpInfo: GroupInfo,
  sourceMap: SourceMap,
  requests: RequestEntry[],
  groups: GroupNodeData[],
  endpoints: EndpointNodeData[],
  edges: ExplorerEdge[],
): void {
  const grpRequests = filterRequests(requests, srcName, grpName);
  const grpMetrics = computeNodeMetrics(grpRequests);

  groups.push({
    source: srcName,
    name: grpName,
    prefix: grpInfo.prefix,
    endpointCount: Object.keys(grpInfo.endpoints).length,
    metrics: grpMetrics,
  });

  edges.push(makeEdge(`source:${srcName}`, `group:${srcName}.${grpName}`, grpMetrics, "source-to-group"));

  for (const [epName, epInfo] of Object.entries(grpInfo.endpoints)) {
    const ep = buildEndpoint(srcName, grpName, epName, epInfo, sourceMap, requests);
    endpoints.push(ep.data);
    edges.push(makeEdge(`group:${srcName}.${grpName}`, ep.nodeId, ep.data.metrics, "group-to-endpoint"));
  }
}

// ── Endpoint builder ────────────────────────────────────────────────────────

function buildEndpoint(
  srcName: string,
  grpName: string,
  epName: string,
  epInfo: EndpointInfo,
  sourceMap: SourceMap,
  requests: RequestEntry[],
): { data: EndpointNodeData; nodeId: string } {
  const epRequests = filterRequests(requests, srcName, grpName || undefined, epName);
  const epMetrics = computeNodeMetrics(epRequests);
  const realMethod = epRequests.find((r) => r.httpMethod)?.httpMethod;

  return {
    nodeId: `endpoint:${srcName}.${grpName}.${epName}`,
    data: {
      source: srcName,
      group: grpName,
      method: epName,
      fullPath: resolveFullPath(srcName, grpName, epName, sourceMap, requests),
      httpMethod: realMethod ?? inferHttpMethod(epInfo.type ?? "untyped", epName),
      endpointType: epInfo.type ?? "untyped",
      hasVariablesSchema: epInfo.hasVariablesSchema,
      hasResponseSchema: epInfo.hasResponseSchema,
      middleware: epInfo.middleware ?? [],
      metrics: epMetrics,
    },
  };
}

// ── Utilities ───────────────────────────────────────────────────────────────

function makeEdge(source: string, target: string, metrics: NodeMetrics, tier: EdgeTier): ExplorerEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    data: {
      isActive: metrics.isActive,
      hasErrors: metrics.errorCount > 0,
      requestsPerMin: 0,
      tier,
    },
  };
}

function countEndpoints(src: SourceInfo): number {
  let count = 0;
  for (const grp of Object.values(src.groups)) {
    count += Object.keys(grp.endpoints).length;
  }
  return count;
}
