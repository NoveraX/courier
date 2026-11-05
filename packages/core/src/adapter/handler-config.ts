import type { Sources } from "../define/types";
import type { PubSubAdapter } from "../realtime/adapters";
import type { ConnectResult } from "./connection-meta";
import type { ProxyRateLimit } from "./rate-limit/types";
import type { AllowedHostsSetting, AllowedOriginsSetting } from "./runtime-policy";
import type { SSELifecycleConfig } from "./sse-types";
import type { ClusterOptions } from "./ws-types";

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
  /**
   * The pub/sub adapter the replicas share: with it, `sseConnections.disconnect()`
   * ends the streams a selector names on every replica, not only this one's
   */
  pubsub?: PubSubAdapter | undefined;
  /** How the replicas sharing `pubsub` trust the commands they send each other */
  cluster?: ClusterOptions | undefined;
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
   *
   * A function in place of the list is called when the first request comes
   * in, not when the module creating the handler runs — which a framework
   * also does while it builds — and its answer is kept. Neither given, nor
   * an answer from the function, the list is `COURIER_ALLOWED_ORIGINS`,
   * comma-separated. A list that cannot be read — the function threw, an
   * entry no browser sends — has every request answered 500 and logged once.
   */
  allowedOrigins?: AllowedOriginsSetting | undefined;
  /**
   * The host names the application is reached by. A request addressed to any
   * other host — a page that pointed its own name at this machine, as a
   * DNS-rebinding attack does — is answered 421 on every transport. Loopback
   * names (`localhost`, `*.localhost`) and IP literals are always served. An
   * entry is a name — a port after it is read past, as a name is served on
   * every port — or `*.example.com` for its sub-domains. Unset, development
   * serves nothing else, and production every name.
   *
   * A function in place of the list is called when the first request comes
   * in and its answer kept: `() => [new URL(process.env.APP_URL!).host]`
   * reads the variable the running application has, where a list would read
   * it while the framework builds the route. Neither given, nor an answer
   * from the function, the names are `COURIER_ALLOWED_HOSTS`,
   * comma-separated. A setting that cannot be read — the function threw, an
   * entry names no host, the variable is set and empty — has every request
   * answered 500 and logged once.
   */
  allowedHosts?: AllowedHostsSetting | undefined;
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
   * How the proxy holds an upload while the call runs. `"auto"`, the
   * default, keeps up to `uploadMemoryBytes` of an upload's files in memory
   * and writes the rest to `uploadDirectory`, each file then a `File` read
   * from disk, where the runtime has a file system — Node — and keeps it all
   * in memory where it has none, on an edge runtime. `"memory"` never
   * writes an upload to disk. Either way the call's variables are a
   * `FormData`, read as often as validation, middleware and a retry need.
   * `"stream"` holds none of it: past its options, the upload is sent on as
   * it arrives, re-encoded under a boundary of the proxy's own, and the
   * call's variables are a `StreamedUpload` that the upstream alone reads —
   * once, so the call is never retried, and without a `Content-Length`.
   */
  uploadMode?: "auto" | "memory" | "stream" | undefined;
  /**
   * How many bytes of one upload's files `"auto"` keeps in memory before the
   * rest go to disk. Defaults to 1 MB; 0 writes every file to disk.
   */
  uploadMemoryBytes?: number | undefined;
  /**
   * The folder `"auto"` makes each upload's own folder in, readable by this
   * process's user alone and removed once the call is done. Defaults to
   * `os.tmpdir()`, which `TMPDIR` sets; where that is a memory-backed
   * `tmpfs`, point this at a disk.
   */
  uploadDirectory?: string | undefined;
  /** The most parts — fields and files — one upload may hold. Defaults to 1000. */
  maxUploadParts?: number | undefined;
  /**
   * The longest pause between two pieces of a request body, in
   * milliseconds, before it is refused with 408. Defaults to 30 seconds.
   */
  bodyIdleTimeoutMs?: number | undefined;
  /**
   * The longest a request body may take to arrive, in milliseconds, before
   * it is refused with 408. Defaults to 5 minutes, as Node's own
   * `requestTimeout`.
   */
  bodyTimeoutMs?: number | undefined;
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
   * a browser that sends neither, such as Safari before 16.4. In
   * development, Studio's Playground is let through on a one-time pass
   * that only Studio's runtime in this process redeems; in production no
   * pass is honoured.
   */
  browsersOnly?: boolean | undefined;
}
