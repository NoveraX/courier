import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { AgentOptions } from "../agent/types";
import { ConfigurationError } from "../errors/configuration-error";
import type { Middleware } from "../middleware/types";
import { assertEndpointSession } from "../session/assert-session-api";
import { idempotencyHeader } from "../utils/idempotency-header";
import type { CacheConfig } from "../validation";
import type { EndpointKind } from "./marker";
import type {
  AnyEndpointOptions,
  ResolvedEndpointOptions,
  RetryOptions,
  TopicKeyReader,
} from "./options";

type SlotName = "response" | "variables" | "send";

/** Everything a builder has accumulated so far. Never mutated in place. */
export interface BuilderState {
  readonly kind: EndpointKind;
  readonly schemas: Readonly<Partial<Record<SlotName, StandardSchemaV1>>>;
  readonly filled: readonly SlotName[];
  /** Middleware of the base the endpoint was built from; `inherit: false` drops it. */
  readonly baseMiddleware: readonly Middleware[];
  /** Middleware the endpoint added itself with `.use()`. */
  readonly middleware: readonly Middleware[];
  readonly allowedHeaders: readonly string[];
  readonly timeout?: number | undefined;
  readonly retry?: RetryOptions | undefined;
  readonly cache?: CacheConfig | undefined;
  readonly meta: Readonly<Record<string, unknown>>;
  /** What a served channel's subscribers share a topic by, from `.topic()`. */
  readonly topicKey?: TopicKeyReader | undefined;
  /** How the endpoint is offered to AI agents, from `.agent()`; `false` keeps it from every one. */
  readonly agent?: AgentOptions | false | undefined;
  /** Whether a browser may call it through the proxy, from `.expose()`; unset, its group or API says. */
  readonly expose?: boolean | undefined;
  /** What the endpoint sends for variables a call leaves out, from `.defaults()`. */
  readonly defaults?: Readonly<Record<string, unknown>> | undefined;
}

/** Start a builder state for a head. */
export function initialState(kind: EndpointKind, inherited: Partial<BuilderState>): BuilderState {
  return {
    kind,
    schemas: {},
    filled: [],
    baseMiddleware: inherited.middleware ?? [],
    middleware: [],
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
 *
 * @param state - The builder so far
 * @param slot - The slot a method fills
 * @param schema - Its schema, or `undefined` for a type alone
 * @param where - The endpoint's address, such as `GET ":id"`, once a verb has named it
 * @returns The builder with the slot filled
 * @throws ConfigurationError `SLOT_ALREADY_SET` when the slot was filled before
 *
 * @example
 * ```ts
 * withSlot(state, "response", UserSchema, 'GET ":id"');
 * ```
 */
export function withSlot(
  state: BuilderState,
  slot: SlotName,
  schema: StandardSchemaV1 | undefined,
  where?: string,
): BuilderState {
  if (state.filled.includes(slot)) {
    throw new ConfigurationError(
      "SLOT_ALREADY_SET",
      `[courier] .${slot}() was called twice on ${where ?? "the same endpoint"}. Each slot takes one schema or type, and the second would replace the first: remove one of the two calls.`,
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

/** Append the names of headers the endpoint carries across the proxy, both ways. */
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
  /* Checked where the endpoint is defined, not on its first call. */
  idempotencyHeader(rest.idempotencyKey);
  assertEndpointSession(rest);
  return {
    middleware: inherit ? [...state.baseMiddleware, ...state.middleware] : state.middleware,
    allowedHeaders: state.allowedHeaders,
    ...(state.timeout !== undefined && { timeout: state.timeout }),
    ...(state.retry !== undefined && { retry: state.retry }),
    ...(state.cache !== undefined && { cache: state.cache }),
    ...(state.topicKey !== undefined && { topicKey: state.topicKey }),
    ...(state.agent !== undefined && { agent: state.agent }),
    meta: state.meta,
    tags,
    inherit,
    ...rest,
  } as ResolvedEndpointOptions;
}
