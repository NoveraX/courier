import type { Middleware } from "../middleware/types";
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
  status?: number;
  delay?: number;
}

/** Options every endpoint accepts, whatever its kind. */
export interface CommonEndpointOptions {
  mock?: MockOptions;
  tags?: readonly string[];
  /** Reason the endpoint is discouraged, surfaced by tooling. */
  deprecated?: string;
  /** Overrides the operation inferred from the wire shape. */
  operation?: OperationKind;
  /**
   * When false, the middleware of the base this endpoint was built from —
   * `courier({ middleware })` and every `extend()` — is not applied here. The
   * endpoint's own `.use()` still is, wherever in the chain it was named, and
   * so is the source's `defineApi({ middleware })`.
   */
  inherit?: boolean;
}

export interface HttpEndpointOptions extends CommonEndpointOptions {
  /** Where the idempotency key is read from, for example `header:idempotency-key`. */
  idempotencyKey?: string;
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
 * Retry policy applied to an endpoint or inherited from its base.
 *
 * Without `on`, a 5xx and a request that got no answer are retried. An
 * endpoint that writes is sent once unless `mutations` is set, since a write
 * whose answer was lost may already have been carried out.
 */
export interface RetryOptions {
  attempts?: number;
  backoff?: "fixed" | "exponential";
  /** Response statuses worth retrying; 0 stands for a request that got no answer. */
  on?: readonly number[];
  /** Retry the endpoint even though it writes (default: false). */
  mutations?: boolean;
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
  /** Reads the key a served channel's subscribers share a topic by, from `.topic()`. */
  readonly topicKey?: TopicKeyReader;
}

/** Reads a topic key from a subscriber's validated variables. */
export type TopicKeyReader = (variables: unknown) => unknown;
