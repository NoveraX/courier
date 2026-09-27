import type { StandardSchemaV1 } from "@standard-schema/spec";
import { ConfigurationError } from "../errors/configuration-error";
import type { Middleware } from "../middleware/types";
import type { CacheConfig } from "../validation";
import type { EndpointKind } from "./marker";
import type { AnyEndpointOptions, ResolvedEndpointOptions, RetryOptions } from "./options";

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
