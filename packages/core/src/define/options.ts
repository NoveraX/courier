import type { AgentOptions } from "../agent/types";
import type { Middleware, MiddlewareResponse } from "../middleware/types";
import type { EndpointSession } from "../session/types";
import type { CacheConfig } from "../validation";

/** How an endpoint reads against a collection, used by mocks and codegen. */
export type OperationKind =
  | "list"
  | "get"
  | "create"
  | "update"
  | "replace"
  | "upsert"
  | "delete"
  | "deleteAll"
  | "custom";

/** Sample data used when this endpoint is served by a generated mock. */
export interface MockOptions {
  example?: unknown;
  status?: number | undefined;
  delay?: number | undefined;
}

/** Options every endpoint accepts, whatever its kind. */
export interface CommonEndpointOptions {
  mock?: MockOptions | undefined;
  tags?: readonly string[] | undefined;
  /** Reason the endpoint is discouraged, surfaced by tooling. */
  deprecated?: string | undefined;
  /** Overrides the operation inferred from the wire shape. */
  operation?: OperationKind | undefined;
  /**
   * When false, the middleware of the base this endpoint was built from —
   * `courier({ middleware })` and every `extend()` — is not applied here. The
   * endpoint's own `.use()` still is, wherever in the chain it was named, and
   * so is the source's `defineApi({ middleware })`.
   */
  inherit?: boolean | undefined;
}

export interface HttpEndpointOptions extends CommonEndpointOptions {
  /** Where the idempotency key is read from, for example `header:idempotency-key`. */
  idempotencyKey?: string | undefined;
  /**
   * Keep a read's variables out of the address it is sent to, whatever its
   * `.cache()` says.
   *
   * Through the proxy a read that declares `.cache()` goes as GET, its
   * variables in the address, so a browser and a CDN can keep the answer —
   * and every access log on the way writes them down. A read whose variables
   * must not be written down, such as an email address or a search someone
   * typed, sets this and is sent as POST; the proxy refuses it over GET.
   */
  sensitiveVariables?: boolean | undefined;
  /**
   * How the endpoint takes its source's `session`: `false` for one that
   * answers every user alike, which then never reads the request being
   * served for it; `"unguarded"` for a write that may carry it whatever
   * request the application serves — one whose harm is nil when another
   * site sets it off, such as signing out.
   */
  session?: EndpointSession | undefined;
  /** `false` keeps the headers the source's `forward` names off this endpoint's calls. */
  forward?: false | undefined;
}

/**
 * Options a stream takes. How its client reconnects is not among them: a
 * browser caller never sees the definition, so the server steers it with the
 * `retry` field of its events instead.
 */
export type StreamEndpointOptions = CommonEndpointOptions;

/**
 * Options a channel takes. Heartbeat and reconnection are not among them:
 * they belong to the socket a caller shares between its channels, not to
 * one endpoint, and are set with the caller's `ws` option.
 */
export type ChannelEndpointOptions = CommonEndpointOptions;

/**
 * Every option any endpoint kind accepts.
 *
 * All kind-specific fields are optional, so an options object written for one
 * kind is assignable here and the runtime can flatten them uniformly.
 */
export interface AnyEndpointOptions
  extends HttpEndpointOptions,
    StreamEndpointOptions,
    ChannelEndpointOptions {}

/**
 * Argument accepted by `.cache()`.
 *
 * Resolves to `never` once the verb writes, so caching a write fails at the
 * call site that wrote it rather than somewhere downstream.
 */
export type CacheArg<TKind extends "query" | "mutation"> = TKind extends "query"
  ? CacheConfig
  : never;

/**
 * A retry policy: on an endpoint, inherited from its base, or given to
 * `retryMiddleware` — one vocabulary for all three.
 *
 * Without `retryOn`, a 5xx and a request that got no answer are retried. An
 * endpoint that writes is sent once, since a write whose answer was lost may
 * already have been carried out — unless it declares an `idempotencyKey`,
 * whose one key on every attempt lets the upstream apply it once, or
 * `mutations` is set.
 *
 * @example
 * ```ts
 * endpoint.get("report").retry({ limit: 5, delay: 1_000, backoff: "fixed", retryOn: [429, 503] });
 * ```
 */
export interface RetryOptions {
  /** How many times a failed attempt is made again (default: 3) */
  limit?: number | undefined;
  /** The wait before the first retry, in ms (default: 300) */
  delay?: number | undefined;
  /** How the wait grows between retries (default: "exponential", doubling it) */
  backoff?: "fixed" | "exponential" | undefined;
  /**
   * Which answers deserve another attempt: their statuses, 0 standing for a
   * request that got no answer, or a test of the answer (default: 0 and 5xx).
   */
  retryOn?: readonly number[] | ((response: MiddlewareResponse) => boolean) | undefined;
  /**
   * Retry an endpoint that writes as well as one that reads (default: only
   * a write whose endpoint declares an `idempotencyKey`, which the upstream
   * applies once however many times it arrives; `false` retries no write).
   */
  mutations?: boolean | undefined;
}

/** Everything the runtime needs about an endpoint, flattened at definition. */
export interface ResolvedEndpointOptions {
  readonly middleware: readonly Middleware[];
  readonly allowedHeaders: readonly string[];
  readonly timeout?: number;
  readonly retry?: RetryOptions;
  readonly cache?: CacheConfig;
  readonly meta: Readonly<Record<string, unknown>>;
  readonly mock?: MockOptions;
  readonly tags: readonly string[];
  readonly deprecated?: string;
  readonly operation?: OperationKind;
  readonly inherit: boolean;
  readonly idempotencyKey?: string;
  /** Sent through the proxy as POST, its variables kept out of the address. */
  readonly sensitiveVariables?: boolean;
  /** How it takes its source's session. */
  readonly session?: EndpointSession;
  /** `false` when it carries none of the headers its source forwards. */
  readonly forward?: false;
  /** Reads the key a served channel's subscribers share a topic by, from `.topic()`. */
  readonly topicKey?: TopicKeyReader;
  /**
   * How it is offered to AI agents, from `.agent()`. Absent, the project's
   * policy decides; `false`, no agent reaches it whatever the policy says.
   */
  readonly agent?: AgentOptions | false;
}

/** Reads a topic key from a subscriber's validated variables. */
export type TopicKeyReader = (variables: unknown) => unknown;
