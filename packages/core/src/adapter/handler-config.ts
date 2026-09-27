import type { SSELifecycleConfig } from "./sse-types";

/** Optional configuration for createHandler */
export interface HandlerConfig extends SSELifecycleConfig {
  /** Additional response headers for SSE (e.g., CORS) */
  sseHeaders?: Record<string, string>;
  /** Max SSE connection lifetime in ms. After TTL, stream closes and client reconnects via Last-Event-ID. */
  sseMaxLifetimeMs?: number;
  /**
   * Origins allowed to call the proxy, for every transport. Unset, the
   * application's own pages and callers that are not a browser are served,
   * and in development other local ports are too.
   */
  allowedOrigins?: string[];
  /**
   * Largest JSON envelope the proxy will read, in bytes. Defaults to 1 MB —
   * an envelope carries a name and its variables, so this is already
   * generous. Raise it only for an endpoint that takes a large JSON payload.
   */
  maxBodyBytes?: number;
  /**
   * Largest `multipart/form-data` upload the proxy will read, in bytes.
   * Defaults to 10 MB. This is the limit uploads are measured against, and
   * it is separate from `maxBodyBytes` because the two differ by orders of
   * magnitude in every application that has both.
   */
  maxUploadBytes?: number;
}
