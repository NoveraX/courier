import type { AgentCall } from "../agent/types";

/** A request the session makes for an endpoint: the double-submit token asked for before a write. */
export type CallPurpose = "csrf-token";

/** Context available to middleware functions */
export type MiddlewareContext = {
  /** Source name (e.g., "api") */
  source: string;
  /** Group name (e.g., "users") */
  group?: string | undefined;
  /** Endpoint method name (e.g., "getAll") */
  method: string;
  /** Request variables (body/params) — can be modified by middleware */
  variables?: unknown;
  /** Request headers — can be modified by middleware */
  headers: Headers;
  /** Transport type — "http" for standard requests, "sse"/"ws" for realtime */
  transport?: "http" | "sse" | "ws" | undefined;
  /**
   * The request as it arrived, before `allowedHeaders` narrowed it.
   *
   * `headers` above is the outbound set: a credential the allowlist does not
   * forward is absent from it. Anything deciding who is asking — a cache
   * partition, an audit line — has to read the request itself.
   */
  request?: Request | undefined;
  /** Whether the endpoint reads or writes, when its schema says. */
  kind?: "query" | "mutation" | undefined;
  /**
   * Whether the call carries the user's session — the API's `session`, taken
   * from the request being served. Its answer belongs to that user alone.
   */
  carriesSession?: boolean | undefined;
  /**
   * What tells the user's calls apart where the credentials the platform
   * sends are out of the call's reach — in a browser or an app, which keep
   * the session's cookies themselves. A cache with scope `"session"`
   * partitions by it there, and by the call's own credentials elsewhere.
   */
  sessionPartition?: string | undefined;
  /**
   * Fires when whoever made the call stops waiting for it: the signal given
   * to the call, or the incoming request's when a proxy runs it. Middleware
   * that waits — between retries, in a queue — should stop when it fires.
   */
  signal?: AbortSignal | undefined;
  /**
   * What the call is when it is none of the API's endpoints but a request
   * the session makes for one: `"csrf-token"`, the double-submit token asked
   * for before a write that found none. Its `method` names no endpoint, and
   * a cache keeps none of its answers.
   */
  purpose?: CallPurpose | undefined;
  /**
   * The agent the call comes from, when an MCP server made it for one: the
   * tool it called, what the endpoint declared that does, and who the server
   * let in. Absent on every call the application makes itself.
   */
  agent?: AgentCall | undefined;
  /**
   * The key this call sends in its endpoint's idempotency header, the same
   * on every attempt: an upstream that deduplicates by it applies the write
   * once however many times it arrives — so a retry policy retries it.
   */
  idempotencyKey?: string | undefined;
  /** Internal: Studio request ID for event correlation */
  _requestId?: string | undefined;
  /**
   * Internal: the headers whose value is still the copy the incoming request
   * forwarded, which the API's session replaces with its own.
   */
  _forwarded?: ReadonlySet<string> | undefined;
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
