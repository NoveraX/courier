/** Context available to middleware functions */
export type MiddlewareContext = {
  /** Source name (e.g., "api") */
  source: string;
  /** Group name (e.g., "users") */
  group?: string;
  /** Endpoint method name (e.g., "getAll") */
  method: string;
  /** Request variables (body/params) — can be modified by middleware */
  variables?: unknown;
  /** Request headers — can be modified by middleware */
  headers: Headers;
  /** Transport type — "http" for standard requests, "sse"/"ws" for realtime */
  transport?: "http" | "sse" | "ws";
  /**
   * The request as it arrived, before `allowedHeaders` narrowed it.
   *
   * `headers` above is the outbound set: a credential the allowlist does not
   * forward is absent from it. Anything deciding who is asking — a cache
   * partition, an audit line — has to read the request itself.
   */
  request?: Request;
  /** Whether the endpoint reads or writes, when its schema says. */
  kind?: "query" | "mutation";
  /**
   * Fires when whoever made the call stops waiting for it: the signal given
   * to the call, or the incoming request's when a proxy runs it. Middleware
   * that waits — between retries, in a queue — should stop when it fires.
   */
  signal?: AbortSignal;
  /** Internal: Studio request ID for event correlation */
  _requestId?: string;
};

/** Response returned from the middleware chain / endpoint execution */
export type MiddlewareResponse = {
  status: number;
  data: unknown;
  headers: Headers;
};

/** Calls the next middleware in the chain, or the endpoint handler */
export type NextFn = () => Promise<MiddlewareResponse>;

// ── Phase-specific handler signatures ──────────────────────────────────────

/** Runs before fetch — can modify ctx/headers, does NOT see response */
export type BeforeHandler = (ctx: MiddlewareContext) => void | Promise<void>;

/** Runs after fetch — receives response, can transform it */
export type AfterHandler = (
  ctx: MiddlewareContext,
  response: MiddlewareResponse,
) => MiddlewareResponse | Promise<MiddlewareResponse>;

/** Wraps around fetch — full onion model, calls next() */
export type WrapHandler = (ctx: MiddlewareContext, next: NextFn) => Promise<MiddlewareResponse>;

// ── Middleware types (discriminated union) ──────────────────────────────────

export type MiddlewarePhase = "before" | "after" | "wrap";

export interface BeforeMiddleware {
  name: string;
  phase: "before";
  handler: BeforeHandler;
}

export interface AfterMiddleware {
  name: string;
  phase: "after";
  handler: AfterHandler;
}

export interface WrapMiddleware {
  name: string;
  phase: "wrap";
  handler: WrapHandler;
}

/** Fully typed middleware with explicit phase and handler signature */
export type Middleware = BeforeMiddleware | AfterMiddleware | WrapMiddleware;
