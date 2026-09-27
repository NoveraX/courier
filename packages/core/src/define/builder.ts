import type { StandardSchemaV1 } from "@standard-schema/spec";
import { ConfigurationError } from "../errors/configuration-error";
import type { HttpMethod } from "../http-client/types";
import type { Middleware } from "../middleware/types";
import type { CacheConfig, SchemaMetadata, Transport } from "../validation";
import type { EndpointKind } from "./marker";
import { ENDPOINT_SCHEMA } from "./marker";
import type { AnyEndpointOptions, ResolvedEndpointOptions, RetryOptions } from "./options";
import type { AnyProbe } from "./probe";

type SlotName = "response" | "variables" | "send";

/** Everything a builder has accumulated so far. Never mutated in place. */
export interface BuilderState {
  readonly kind: EndpointKind;
  readonly schemas: Readonly<Partial<Record<SlotName, StandardSchemaV1>>>;
  readonly filled: readonly SlotName[];
  readonly middleware: readonly Middleware[];
  readonly allowedHeaders: readonly string[];
  readonly timeout?: number;
  readonly retry?: RetryOptions;
  readonly cache?: CacheConfig;
  readonly meta: Readonly<Record<string, unknown>>;
}

/** Start a builder state for a head. */
export function initialState(kind: EndpointKind, inherited: Partial<BuilderState>): BuilderState {
  return {
    kind,
    schemas: {},
    filled: [],
    middleware: inherited.middleware ?? [],
    allowedHeaders: inherited.allowedHeaders ?? [],
    ...(inherited.timeout !== undefined && { timeout: inherited.timeout }),
    ...(inherited.retry !== undefined && { retry: inherited.retry }),
    meta: inherited.meta ?? {},
  };
}

/**
 * Record a slot.
 *
 * Slots replace rather than merge, so filling one twice is a mistake worth
 * reporting where it was written instead of silently dropping a value.
 */
export function withSlot(
  state: BuilderState,
  slot: SlotName,
  schema: StandardSchemaV1 | undefined,
): BuilderState {
  if (state.filled.includes(slot)) {
    throw new ConfigurationError(
      "SLOT_ALREADY_SET",
      `[courier] .${slot}() was called twice on the same endpoint — each slot may be set once`,
    );
  }
  return {
    ...state,
    filled: [...state.filled, slot],
    schemas: schema === undefined ? state.schemas : { ...state.schemas, [slot]: schema },
  };
}

/** Append middleware, preserving declaration order. */
export function withMiddleware(state: BuilderState, added: readonly Middleware[]): BuilderState {
  return { ...state, middleware: [...state.middleware, ...added] };
}

/** Append forwarded response header names. */
export function withHeaders(state: BuilderState, names: readonly string[]): BuilderState {
  return { ...state, allowedHeaders: [...state.allowedHeaders, ...names] };
}

/** Replace a scalar setting. */
export function withValue<K extends "timeout" | "retry" | "cache">(
  state: BuilderState,
  key: K,
  value: BuilderState[K],
): BuilderState {
  return { ...state, [key]: value };
}

/** Merge tooling metadata. */
export function withMeta(state: BuilderState, values: Record<string, unknown>): BuilderState {
  return { ...state, meta: { ...state.meta, ...values } };
}

/** Flatten the accumulated state and the terminal options into runtime form. */
export function resolveOptions(
  state: BuilderState,
  options: AnyEndpointOptions,
): ResolvedEndpointOptions {
  const { inherit = true, tags = [], ...rest } = options;
  return {
    middleware: inherit ? state.middleware : [],
    allowedHeaders: state.allowedHeaders,
    ...(state.timeout !== undefined && { timeout: state.timeout }),
    ...(state.retry !== undefined && { retry: state.retry }),
    ...(state.cache !== undefined && { cache: state.cache }),
    meta: state.meta,
    tags,
    inherit,
    ...rest,
  } as ResolvedEndpointOptions;
}

const TRANSPORT_BY_KIND: Record<EndpointKind, Transport> = {
  query: "http",
  mutation: "http",
  stream: "sse",
  channel: "ws",
};

/**
 * Build the metadata stamped on a descriptor.
 *
 * Kept in the shape every consumer already reads, so the mock generator, the
 * studio codegen and the request executor need no knowledge of how an endpoint
 * was authored. The channel send slot is recorded as `receive` because that
 * field names the same messages from the server's side.
 */
export function resolveSchemas(state: BuilderState): SchemaMetadata {
  const { response, variables, send } = state.schemas;
  const transport = TRANSPORT_BY_KIND[state.kind];
  return {
    ...(response !== undefined && { response }),
    ...(variables !== undefined && { variables }),
    ...(send !== undefined && { receive: send }),
    /* Declaring the slot is what makes a channel bidirectional; a schema on it
       only decides whether inbound messages are validated. */
    ...(state.filled.includes("send") && { bidirectional: true as const }),
    ...((state.kind === "query" || state.kind === "mutation") && { type: state.kind }),
    ...(transport !== "http" && { transport }),
    ...(state.cache !== undefined && { cache: state.cache }),
  };
}

/**
 * Produce the descriptor for an endpoint whose implementation lives here.
 *
 * A stream or channel is served by the process that defines it, so the
 * function it carries produces events rather than addressing a remote one.
 * Its location comes from the group prefix and the endpoint name, so there is
 * no wire shape to probe.
 */
export function sealHandler(
  state: BuilderState,
  handler: AnyProbe,
  options: AnyEndpointOptions,
): Record<string | symbol, unknown> {
  return {
    [ENDPOINT_SCHEMA]: resolveSchemas(state),
    kind: state.kind,
    method: "get" as const,
    path: "",
    probe: handler,
    served: true,
    options: resolveOptions(state, options),
  };
}

/**
 * Produce the descriptor a verb terminal returns.
 *
 * The verb and the path are given rather than discovered, so nothing is probed
 * and the closure that carries out the call is synthesised from them.
 */
export function sealAt(
  state: BuilderState,
  wire: { method: HttpMethod; path: string; probe: AnyProbe; served: boolean },
  options: AnyEndpointOptions,
): Record<string | symbol, unknown> {
  return {
    [ENDPOINT_SCHEMA]: resolveSchemas(state),
    kind: state.kind,
    method: wire.method,
    path: wire.path,
    probe: wire.probe,
    served: wire.served,
    options: resolveOptions(state, options),
  };
}

/**
 * Which kind an endpoint addressed this way is.
 *
 * A stream or a channel is its own kind whatever the verb underneath. An HTTP
 * endpoint reads when its verb reads; `.reads()` says so for the rest.
 */
export function kindFor(head: EndpointKind, method: HttpMethod): EndpointKind {
  if (head !== "query" && head !== "mutation") return head;
  return READING_METHODS.has(method) ? "query" : "mutation";
}

const READING_METHODS: ReadonlySet<HttpMethod> = new Set<HttpMethod>(["get", "head", "options"]);
