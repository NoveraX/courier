import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Middleware } from "../middleware/types";
import type { CacheConfig } from "../validation";
import type { EndpointKind } from "./marker";

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

/** Reconnection policy for endpoints holding an open connection. */
export interface ReconnectOptions {
  maxAttempts?: number;
  backoff?: "fixed" | "exponential";
  initialDelay?: number;
}

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
  /** When false, middleware declared further up is not applied here. */
  inherit?: boolean;
}

export interface HttpEndpointOptions extends CommonEndpointOptions {
  /** Where the idempotency key is read from, for example `header:idempotency-key`. */
  idempotencyKey?: string;
}

export interface StreamEndpointOptions extends CommonEndpointOptions {
  reconnect?: ReconnectOptions;
  lastEventIdHeader?: string;
}

export interface ChannelEndpointOptions extends CommonEndpointOptions {
  reconnect?: ReconnectOptions;
  /** Heartbeat interval in milliseconds. */
  heartbeat?: number;
}

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
 * Resolves to `never` outside the `query` head, so caching a mutation fails at
 * the call site that wrote it rather than somewhere downstream.
 */
export type CacheArg<TKind extends EndpointKind> = TKind extends "query" ? CacheConfig : never;

/** Retry policy applied to an endpoint or inherited from its base. */
export interface RetryOptions {
  attempts?: number;
  backoff?: "fixed" | "exponential";
  /** Response statuses worth retrying. */
  on?: readonly number[];
}

/** Schemas captured by the builder slots, kept in a non-generic shape. */
export interface EndpointSchemas {
  response?: StandardSchemaV1;
  variables?: StandardSchemaV1;
  send?: StandardSchemaV1;
  readonly kind: EndpointKind;
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
  readonly reconnect?: ReconnectOptions;
  readonly lastEventIdHeader?: string;
  readonly heartbeat?: number;
}
