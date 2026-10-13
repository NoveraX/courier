import type { Sources } from "../define/types";
import type { ConnectResult } from "./connection-meta";
import type { ProxyRateLimit } from "./rate-limit/types";
import type { SSELifecycleConfig } from "./sse-types";

/**
 * Optional configuration for createHandler. `TConnect` is what
 * `onSSEConnect` returns, which types the `meta` the other SSE hooks
 * receive; it is inferred from `onSSEConnect` itself.
 */
export interface HandlerConfig<TConnect extends ConnectResult = ConnectResult>
  extends SSELifecycleConfig<TConnect> {
  /**
   * The sources this handler answers for. Left out, it answers for the
   * process-wide registry that `attachRuntime()` and `registerSources` fill,
   * read at request time. A server handed its own sources passes them here,
   * so another server or a later `registerSources` in the same process
   * cannot change what it serves.
   */
  sources?: Sources | undefined;
  /** Additional response headers for SSE (e.g., CORS) */
  sseHeaders?: Record<string, string> | undefined;
  /** Max SSE connection lifetime in ms. After TTL, stream closes and client reconnects via Last-Event-ID. */
  sseMaxLifetimeMs?: number | undefined;
  /**
   * Origins allowed to call the proxy, for every transport. Unset, the
   * application's own pages and callers that are not a browser are served,
   * and in development other local ports are too. An entry is an exact
   * origin, `https://*.example.com` for the sub-domains of a host over one
   * scheme and port, or `*.example.com` for them over any.
   */
  allowedOrigins?: string[] | undefined;
  /**
   * The host names the application is reached by. A request addressed to any
   * other host — a page that pointed its own name at this machine, as a
   * DNS-rebinding attack does — is answered 421 on every transport. Loopback
   * names (`localhost`, `*.localhost`) and IP literals are always served. An
   * entry is a name without a port, or `*.example.com` for its sub-domains.
   * Unset, development serves nothing else, and production every name.
   */
  allowedHosts?: string[] | undefined;
  /**
   * Largest JSON envelope the proxy will read, in bytes. Defaults to 1 MB —
   * an envelope carries a name and its variables, so this is already
   * generous. Raise it only for an endpoint that takes a large JSON payload.
   */
  maxBodyBytes?: number | undefined;
  /**
   * Largest `multipart/form-data` upload the proxy will read, in bytes.
   * Defaults to 10 MB. This is the limit uploads are measured against, and
   * it is separate from `maxBodyBytes` because the two differ by orders of
   * magnitude in every application that has both.
   */
  maxUploadBytes?: number | undefined;
  /**
   * How many calls one caller may make through the proxy: every call takes
   * one from `requests` in each `window`, a write from `writes` as well,
   * and a call past either is answered 429 with `Retry-After`. A caller is
   * the user's address by default. Unset, the proxy limits nobody — and
   * whatever it exposes, a script can call as fast as it likes with your
   * server's keys.
   */
  rateLimit?: ProxyRateLimit | undefined;
  /**
   * Answer only requests a browser sent: one that carries neither
   * `Sec-Fetch-Site` nor `Origin`, as a script, curl or a crawler sends, is
   * refused with 403. It keeps that noise off your APIs and protects
   * nothing: any client can send both headers. Server code that calls the
   * proxy route over HTTP is refused too, and so is a same-origin read from
   * a browser that sends neither, such as Safari before 16.4.
   */
  browsersOnly?: boolean | undefined;
}
