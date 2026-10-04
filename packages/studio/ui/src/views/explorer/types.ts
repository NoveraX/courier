// ── Node data for React Flow ────────────────────────────────────────────────

export interface NodeMetrics {
  totalRequests: number;
  successRate: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  errorCount: number;
  avgSize: number;
  lastRequestAt: number | null;
  isActive: boolean;
  [key: string]: unknown;
}

export interface SourceNodeData {
  name: string;
  baseURL: string;
  groupCount: number;
  endpointCount: number;
  metrics: NodeMetrics;
  [key: string]: unknown;
}

export interface GroupNodeData {
  source: string;
  name: string;
  prefix: string;
  endpointCount: number;
  metrics: NodeMetrics;
  [key: string]: unknown;
}

export interface EndpointNodeData {
  source: string;
  group: string;
  method: string;
  fullPath: string;
  httpMethod: string;
  endpointType: "query" | "mutation" | "untyped";
  transport?: "sse" | "ws" | undefined;
  hasVariablesSchema: boolean;
  hasResponseSchema: boolean;
  middleware: string[];
  metrics: NodeMetrics;
  [key: string]: unknown;
}

// ── Explorer state ──────────────────────────────────────────────────────────

export type ExplorerLayout = "LR" | "TB";
export type ExplorerMetricMode = "latency" | "errors" | "traffic" | "size";
export type HealthLevel = "healthy" | "degraded" | "critical" | "inactive";

export interface ExplorerSearchParams {
  layout?: ExplorerLayout | undefined;
  search?: string | undefined;
  selected?: string | undefined;
  metricMode?: ExplorerMetricMode | undefined;
  minimap?: boolean | undefined;
}

// ── Heatmap types ───────────────────────────────────────────────────────────

export type HeatmapLevel = "good" | "warn" | "bad" | "critical" | "none";

// ── Edge data ───────────────────────────────────────────────────────────────

export type EdgeTier = "source-to-group" | "source-to-endpoint" | "group-to-endpoint";

export interface ExplorerEdgeData {
  isActive: boolean;
  hasErrors: boolean;
  requestsPerMin: number;
  tier: EdgeTier;
  [key: string]: unknown;
}
