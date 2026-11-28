/**
 * What an endpoint's definition says of it, stored on the endpoint under
 * `ENDPOINT_SCHEMA`: its schemas, its stages, its kind, its cache hints and
 * its defaults. Apart from what checks a value against a schema
 * (`validation/index.ts`), which only a call runs: a page of definitions
 * alone loads that none.
 */

import type { StandardSchemaV1 } from "@standard-schema/spec";

/** Symbol key for attaching schema metadata to endpoint functions */
export const ENDPOINT_SCHEMA: unique symbol = Symbol.for("courier.endpoint.schema");

/** Cache configuration for proxy GET responses */
export interface CacheConfig {
  /** Cache duration in seconds (maps to s-maxage) */
  revalidate?: number | undefined;
  /** Tags for Next.js revalidateTag() invalidation */
  tags?: string[] | undefined;
}

/** Transport mode for an endpoint */
export type Transport = "http" | "sse" | "ws";

/**
 * A stage an answer passes through after its schema, from `.map()`: what it
 * maps the data to, told the answer's status and headers.
 */
export type AnswerStage = (
  data: unknown,
  answer: { readonly status: number; readonly headers: Headers },
) => unknown;

/** Schema metadata attached to an endpoint function */
export interface SchemaMetadata {
  response?: StandardSchemaV1;
  /**
   * The stages the answer passes through, in order, once `response` has
   * checked it: what the last gives is what the call resolves to.
   */
  map?: readonly AnswerStage[];
  variables?: StandardSchemaV1;
  /** Endpoint type — "query" enables GET proxy, "mutation" requires POST */
  type?: "query" | "mutation";
  /**
   * Whether `.reads()` or `.writes()` named the type, rather than the verb
   * that addresses the endpoint: a closure whose verb decided it calls verbs
   * of that kind alone on every call.
   */
  typeNamed?: true;
  /** Cache hints for proxy GET responses */
  cache?: CacheConfig;
  /**
   * What the endpoint sends for variables a call leaves out, from
   * `.defaults()`: filled in where the call is made — on the server, for a
   * browser's call through the proxy — before the variables are validated.
   */
  defaults?: Readonly<Record<string, unknown>>;
  /** Transport mode — "http" (default), "sse" for streaming, "ws" for WebSocket */
  transport?: Transport;
  /**
   * Whether a browser may call it through the application's proxy, from
   * `.expose()`. Unset, the nearest group that says, then the API, decides.
   */
  expose?: boolean;
  /** Standard Schema for incoming WS messages (bidirectional channels only) */
  receive?: StandardSchemaV1;
  /**
   * May the caller send on this channel?
   *
   * Set by declaring the send slot, with or without a schema — a channel whose
   * inbound messages are typed but not validated is still bidirectional.
   */
  bidirectional?: true;
}
