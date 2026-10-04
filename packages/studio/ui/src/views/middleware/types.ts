// ── Middleware step (per-request chain entry) ──────────────────────────────

export interface MiddlewareStep {
  name: string;
  index: number;
  duration: number;
  status: "completed" | "running" | "error";
  /** Determined from declared phase or inferred from timing */
  phase: "request" | "response" | "wrap";
  error?: string | undefined;
  headersAdded?: string[] | undefined;
  /** Time spent before calling next() (ms) */
  beforeDuration?: number | undefined;
  /** Time spent after next() returned (ms) */
  afterDuration?: number | undefined;
}

// ── Aggregate stats (across all requests) ──────────────────────────────────

export interface AggregateMiddleware {
  name: string;
  calls: number;
  avgDuration: number;
  maxDuration: number;
  p95Duration: number;
  errors: number;
  errorRate: number;
  totalDuration: number;
}

// ── Chain entry (single request pipeline) ──────────────────────────────────

export interface ChainEntry {
  requestId: string;
  steps: MiddlewareStep[];
  totalOverhead: number;
  overheadPercent: number;
  /** Whether the request got as far as its HTTP fetch; a middleware can stop it before. */
  reachedFetch: boolean;
}

// ── Sparkline / KPI ─────────────────────────────────────────────────────────

export interface SparklinePoint {
  value: number;
}

// ── Endpoint impact ────────────────────────────────────────────────────────

export interface EndpointImpact {
  key: string;
  source: string;
  group: string;
  method: string;
  httpMethod: string;
  requestCount: number;
  avgMiddlewareTime: number;
  overheadPercent: number;
  middlewareCount: number;
  /** For navigating to chain view */
  sampleRequestId: string;
}

// ── Overhead gauge thresholds ──────────────────────────────────────────────

export type OverheadLevel = "good" | "warning" | "critical";

// ── Sort / mode controls ───────────────────────────────────────────────────

export type MiddlewareMode = "aggregate" | "chain";

/** How a request's time splits on average: middleware, the fetch, and the rest. */
export interface OverheadStats {
  avgOverheadPercent: number;
  avgFetchPercent: number;
  avgOtherPercent: number;
}

export type SortDir = "asc" | "desc";
