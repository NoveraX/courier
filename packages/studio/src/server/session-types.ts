/**
 * Session persistence types.
 */

import type { SessionEnvironment } from "./session-file/session-environment";

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
  /** What it was recorded on, when it was opened from a session file. */
  environment?: SessionEnvironment | undefined;
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
  /** The size in bytes of the whole variables, when `variables` is a part of them. */
  variablesCutFrom?: number | undefined;
  mode: "direct" | "proxy" | "webhook";
  type?: "query" | "mutation" | undefined;
  status: string;
  statusCode?: number | undefined;
  timing?: Record<string, number> | undefined;
  size?: number | undefined;
  data?: unknown;
  /** The size in bytes of the whole answer, when `data` is a part of it. */
  dataCutFrom?: number | undefined;
  requestHeaders?: Record<string, string> | undefined;
  responseHeaders?: Record<string, string> | undefined;
  error?: { type: string; status?: number; message: string } | undefined;
  startedAt: number;
  url?: string | undefined;
  /** The HTTP version the request went over, when its runtime could tell. */
  httpVersion?: string | undefined;
  sessionId: string;
  /** The runtime that made a proxied call, when it said so. */
  callerRuntimeId?: string | undefined;
  /** The agent tool the call ran for, when an MCP server made it. */
  agent?: { tool: string; access: "read" | "write" | "destructive"; client?: string } | undefined;
  /** The key the call sent in its endpoint's idempotency header. */
  idempotencyKey?: string | undefined;
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
