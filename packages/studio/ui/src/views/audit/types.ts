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
  /** Single endpoint (ungrouped legacy) */
  endpoint?: string;
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
  errorRate: number;
  count: number;
  sizes: number[];
  avgSize: number;
  hasVariablesValidation: boolean;
  hasResponseValidation: boolean;
  modes: Set<string>;
  statusCodes: number[];
  /** Avg middleware time as fraction of total (0-1) */
  middlewareOverhead: number;
  /** Avg validation time as fraction of total (0-1) */
  validationOverhead: number;
  /** Avg proxy overhead as fraction of total (0-1) */
  proxyOverhead: number;
  /** HTTP methods used (GET, POST, etc.) */
  httpMethods: Set<string>;
  /** Endpoint type from catalog */
  type?: "query" | "mutation";
  /** All request IDs for this endpoint */
  requestIds: string[];
  /** Whether any call went through a cache, hit or miss */
  cached: boolean;
}
