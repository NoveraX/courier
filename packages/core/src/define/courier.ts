import type { BuilderState } from "./builder";
import { initialState } from "./builder";
import type {
  ChannelBuilder,
  Courier,
  CourierBaseConfig,
  HttpBuilder,
  StreamBuilder,
} from "./builder-types";
import { makeBuilder } from "./make-builder";
import type { EndpointKind } from "./marker";
import type { AnyBuilder } from "./refinements";

function head(kind: EndpointKind, inherited: Partial<BuilderState>): AnyBuilder {
  return makeBuilder(initialState(kind, inherited));
}

function inheritedFrom(
  config: CourierBaseConfig,
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
    endpoint: head("query", inherited) as unknown as HttpBuilder<void, void>,
    stream: head("stream", inherited) as unknown as StreamBuilder<void, void, void>,
    channel: head("channel", inherited) as unknown as ChannelBuilder<void, void, void, never>,
    extend: (config: CourierBaseConfig): Courier => makeBase(inheritedFrom(config, inherited)),
  };
}

/**
 * Create a reusable base carrying settings every endpoint built from it shares.
 *
 * Nothing here moves an endpoint's types, so a base costs no type
 * instantiations and can be shared across an entire vendor surface.
 *
 * @param config - middleware, forwarded headers and defaults to apply
 * @returns the three builder heads plus `extend`
 *
 * @example
 * ```ts
 * const vendor = courier({
 *   middleware: [bearer],
 *   timeout: 10_000,
 *   retry: { limit: 3, backoff: "exponential", retryOn: [429, 503] },
 * });
 *
 * const { endpoint } = vendor;
 *
 * export const getUser = endpoint.get(":id").variables(ById).response(UserSchema);
 * ```
 */
export function courier(config: CourierBaseConfig = {}): Courier {
  return makeBase(inheritedFrom(config));
}
