import type { SSELifecycleConfig } from "./sse-types";

/** Optional configuration for createHandler */
export interface HandlerConfig extends SSELifecycleConfig {
  /** Additional response headers for SSE (e.g., CORS) */
  sseHeaders?: Record<string, string>;
  /** Max SSE connection lifetime in ms. After TTL, stream closes and client reconnects via Last-Event-ID. */
  sseMaxLifetimeMs?: number;
  /** Allowed origins for SSE CSWSH prevention (prod: rejects all if unset, dev: allows all) */
  allowedOrigins?: string[];
}
