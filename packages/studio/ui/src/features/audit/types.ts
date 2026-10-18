export type AuditSeverity = "error" | "warning" | "hint" | "pass";

export type AuditCategory = "performance" | "reliability" | "security" | "best-practices";

export interface AuditEndpoint {
  key: string;
  label: string;
  detail?: string;
  /** Request IDs for deep-linking to Timeline/Waterfall */
  requestIds?: string[];
}

export interface AuditItem {
  id: string;
  severity: AuditSeverity;
  category: AuditCategory;
  title: string;
  description: string;
  suggestion?: string;
  /** Courier code snippet for the fix */
  codeSuggestion?: string;
  /** Grouped affected endpoints */
  endpoints?: AuditEndpoint[];
  /** Request IDs related to this item (for deep links) */
  requestIds?: string[];
  meta?: Record<string, unknown>;
}

export interface AuditResult {
  items: AuditItem[];
  score: number;
  breakdown: Record<AuditSeverity, number>;
  timestamp: number;
}

/** What the audit knows beyond the requests. */
export interface AuditContext {
  /** The sessions of the runtimes that run in a browser. */
  browserSessions: ReadonlySet<string>;
}

export interface EndpointStats {
  key: string;
  source: string;
  group: string;
  method: string;
  avgDuration: number;
  p95: number;
  /** The share of its requests that failed (0-1) */
  errorRate: number;
  /** The calls the app's code made to it */
  count: number;
  /** The requests its calls sent: a read another call's request answered sent none */
  sent: number;
  /** The size of each answer its requests got */
  sizes: number[];
  avgSize: number;
  hasVariablesValidation: boolean;
  hasResponseValidation: boolean;
  /** Whether any call sent variables, which a schema could have checked */
  sentVariables: boolean;
  modes: Set<string>;
  /** The status code of each answer its requests got */
  statusCodes: number[];
  /** Middleware's share of a call's time, averaged over its calls (0-1) */
  middlewareOverhead: number;
  /** Validation's share of a call's time, averaged over its calls (0-1) */
  validationOverhead: number;
  /** The share of a proxied request's whole time spent on the trips to and from the proxy, on average (0-1) */
  proxyOverhead: number;
  /** HTTP methods used (GET, POST, etc.) */
  httpMethods: Set<string>;
  /** Endpoint type from catalog */
  type?: "query" | "mutation" | undefined;
  /** The ids of all its calls */
  requestIds: string[];
  /** Whether any call went through a cache, hit or miss */
  cached: boolean;
  /** Whether any call sent an idempotency key, so a retried write of it is applied once */
  keyed: boolean;
}
