/**
 * Session persistence types.
 */

export interface SavedSession {
  /** Unique session ID */
  id: string;
  /** Human-readable name (auto-generated or user-provided) */
  name: string;
  /** When the session was saved */
  savedAt: number;
  /** When the session started (first request) */
  startedAt: number;
  /** Total duration in ms */
  duration: number;
  /** Connected app metadata */
  apps: SavedSessionApp[];
  /** All captured requests */
  requests: SavedRequest[];
  /** Session summary stats */
  stats: SessionStats;
}

export interface SavedSessionApp {
  sessionId: string;
  framework: string;
  courierVersion: string;
  connectedAt: number;
}

export interface SavedRequest {
  id: string;
  source: string;
  group?: string | undefined;
  method: string;
  httpMethod?: string | undefined;
  variables: unknown;
  mode: "direct" | "proxy";
  type?: "query" | "mutation" | undefined;
  status: string;
  statusCode?: number | undefined;
  timing?: Record<string, number> | undefined;
  size?: number | undefined;
  data?: unknown;
  requestHeaders?: Record<string, string> | undefined;
  responseHeaders?: Record<string, string> | undefined;
  error?: { type: string; status?: number; message: string } | undefined;
  startedAt: number;
  url?: string | undefined;
  /** The HTTP version the request went over, when its runtime could tell. */
  httpVersion?: string | undefined;
  sessionId: string;
}

export interface SessionStats {
  totalRequests: number;
  successCount: number;
  errorCount: number;
  avgDuration: number;
  totalSize: number;
}

export interface SessionSummary {
  id: string;
  name: string;
  savedAt: number;
  startedAt: number;
  duration: number;
  stats: SessionStats;
  appCount: number;
}
