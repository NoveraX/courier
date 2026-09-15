import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Middleware } from "../middleware/types";
import type { CacheConfig } from "../validation";
import type { BuilderState } from "./builder";
import {
  initialState,
  sealEndpoint,
  sealHandler,
  withHeaders,
  withMeta,
  withMiddleware,
  withSlot,
  withValue,
} from "./builder";
import type {
  ChannelBuilder,
  Courier,
  CourierConfig,
  HttpBuilder,
  StreamBuilder,
} from "./builder-types";
import type { EndpointKind } from "./marker";
import type { AnyEndpointOptions, RetryOptions } from "./options";
import type { AnyProbe } from "./probe";

type AnyBuilder = Record<string, unknown>;

/**
 * Build the method surface shared by every head.
 *
 * Each method returns a fresh builder over an updated state, so a partially
 * applied builder can be reused by several endpoints without any of them
 * observing another's settings.
 */
function makeBuilder(state: BuilderState): AnyBuilder {
  const next = (updated: BuilderState): AnyBuilder => makeBuilder(updated);

  return {
    response: (schema?: StandardSchemaV1) => next(withSlot(state, "response", schema)),
    variables: (schema?: StandardSchemaV1) => next(withSlot(state, "variables", schema)),
    send: (schema?: StandardSchemaV1) => next(withSlot(state, "send", schema)),
    use: (...middleware: Middleware[]) => next(withMiddleware(state, middleware)),
    headers: (names: readonly string[]) => next(withHeaders(state, names)),
    timeout: (ms: number) => next(withValue(state, "timeout", ms)),
    retry: (options: RetryOptions) => next(withValue(state, "retry", options)),
    cache: (config: CacheConfig) => next(withValue(state, "cache", config)),
    meta: (values: Record<string, unknown>) => next(withMeta(state, values)),
    via: (probe: AnyProbe, options: AnyEndpointOptions = {}) => sealEndpoint(state, probe, options),
    implement: (handler: AnyProbe, options: AnyEndpointOptions = {}) =>
      sealHandler(state, handler, options),
  };
}

function head(kind: EndpointKind, inherited: Partial<BuilderState>): AnyBuilder {
  return makeBuilder(initialState(kind, inherited));
}

function inheritedFrom(
  config: CourierConfig,
  parent?: Partial<BuilderState>,
): Partial<BuilderState> {
  return {
    middleware: [...(parent?.middleware ?? []), ...(config.middleware ?? [])],
    allowedHeaders: [...(parent?.allowedHeaders ?? []), ...(config.allowedHeaders ?? [])],
    ...((config.timeout ?? parent?.timeout) !== undefined && {
      timeout: config.timeout ?? parent?.timeout,
    }),
    ...((config.retry ?? parent?.retry) !== undefined && { retry: config.retry ?? parent?.retry }),
    meta: { ...(parent?.meta ?? {}), ...(config.meta ?? {}) },
  };
}

function makeBase(inherited: Partial<BuilderState>): Courier {
  return {
    query: head("query", inherited) as unknown as HttpBuilder<void, void, "query">,
    mutation: head("mutation", inherited) as unknown as HttpBuilder<void, void, "mutation">,
    stream: head("stream", inherited) as unknown as StreamBuilder<void, void>,
    channel: head("channel", inherited) as unknown as ChannelBuilder<void, void, never>,
    extend: (config: CourierConfig): Courier => makeBase(inheritedFrom(config, inherited)),
  };
}

/**
 * Create a reusable base carrying settings every endpoint built from it shares.
 *
 * Nothing here moves an endpoint's types, so a base costs no type
 * instantiations and can be shared across an entire vendor surface.
 *
 * @param config - middleware, forwarded headers and defaults to apply
 * @returns the four builder heads plus `extend`
 *
 * @example
 * ```ts
 * const vendor = courier({
 *   id: "vendor",
 *   middleware: [bearer],
 *   timeout: 10_000,
 *   retry: { attempts: 3, backoff: "exponential", on: [429, 503] },
 * });
 *
 * const { query, mutation } = vendor;
 *
 * export const getUser = query
 *   .variables(ById)
 *   .response(UserSchema)
 *   .via((http, vars) => http.get(":id", vars));
 * ```
 */
export function courier(config: CourierConfig = {}): Courier {
  return makeBase(inheritedFrom(config));
}
