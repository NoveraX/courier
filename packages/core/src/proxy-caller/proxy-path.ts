/**
 * `ProxyPath` — the unified proxy endpoint configuration shape used by both
 * `defineApi` (server-side metadata) and `createProxyCaller` (browser-side
 * defaults). Each transport may carry either a relative path resolved against
 * the runtime origin, or an absolute URL used as-is.
 *
 * This module is intentionally dependency-free so it can be imported from
 * `http-client/types.ts` (where `BaseOptions` lives) without creating cycles.
 * The corresponding `resolveProxyPath` runtime helper lives next door in
 * `./resolve-path.ts`.
 */

/**
 * Per-transport proxy endpoint configuration. Every field is optional so
 * callers can override individual transports without restating the others
 * (see {@link mergeProxyPath} for the per-transport precedence rule).
 */
export type ProxyPath = {
  /**
   * HTTP proxy endpoint path or absolute URL.
   *
   * - Relative path (`"/api/request"`) → resolved against `location.origin`.
   * - Absolute URL (`"https://api.example.com/proxy"`) → used as-is, useful
   *   for cross-origin BFF or CDN-fronted proxies.
   * - Omitted → defaults to `"/api/request"` at resolution time.
   */
  http?: string;

  /**
   * SSE proxy endpoint path or absolute URL.
   *
   * - Relative path (`"/api/sse"`) → resolved against `location.origin`.
   * - Absolute URL (`"https://realtime.example.com/sse"`) → used as-is.
   * - Omitted → defaults to `"/api/sse"` at resolution time.
   */
  sse?: string;

  /**
   * WS proxy endpoint URL.
   *
   * - Relative path (`"/api/ws"`) → resolved against `location.origin`,
   *   protocol derived from `location.protocol` (`https:` → `wss:`,
   *   `http:` → `ws:`). Only valid in runtimes that natively host WS upgrades
   *   (Hono, Fastify, Express, NestJS, standalone `@noverax/courier-server`).
   * - Absolute URL (`"ws://localhost:3001"`, `"wss://realtime.example.com"`)
   *   → used as-is. Required for Next.js App Router, Cloudflare Workers,
   *   Vercel Edge, AWS Lambda — any runtime that cannot host WS in-process.
   *   Point this at a running `@noverax/courier-server` instance.
   * - Omitted → no default. Invoking a WS endpoint without `proxyPath.ws`
   *   throws `ConfigurationError("WS_PATH_NOT_CONFIGURED", ...)` — silent
   *   `localhost` defaults caused production-only breakage in earlier versions.
   */
  ws?: string;
};

/**
 * Per-transport precedence merge: caller-level overrides win over source-level
 * defaults on a field-by-field basis. Either side may be `undefined` (or
 * partial), in which case the other side's value is used.
 *
 * @example
 * ```ts
 * const source = { http: "/api/request", sse: "/api/sse", ws: "wss://prod.example.com" };
 * const caller = { ws: "ws://localhost:3001" };
 * mergeProxyPath(caller, source);
 * // → { http: "/api/request", sse: "/api/sse", ws: "ws://localhost:3001" }
 * ```
 */
export function mergeProxyPath(
  caller: ProxyPath | undefined,
  source: ProxyPath | undefined,
): ProxyPath | undefined {
  if (!caller && !source) return undefined;
  return {
    http: caller?.http ?? source?.http,
    sse: caller?.sse ?? source?.sse,
    ws: caller?.ws ?? source?.ws,
  };
}
