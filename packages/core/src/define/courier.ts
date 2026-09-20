import type { StandardSchemaV1 } from "@standard-schema/spec";
import { ConfigurationError } from "../errors/configuration-error";
import type { HttpMethod } from "../http-client/types";
import type { Middleware } from "../middleware/types";
import type { CacheConfig } from "../validation";
import type { BuilderState } from "./builder";
import {
  initialState,
  kindFor,
  sealAt,
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
import { probeWire } from "./probe";

type AnyBuilder = Record<string, unknown>;

/** Where an endpoint sits, once a verb has said so. */
interface Wire {
  readonly method: HttpMethod;
  readonly path: string;
  readonly probe: AnyProbe;
  readonly served: boolean;
}

/** Every verb that may begin a chain, plus the one a channel connects with. */
const VERBS: readonly HttpMethod[] = ["get", "head", "post", "put", "patch", "del"];

/**
 * The methods that refine an endpoint without saying where it is.
 *
 * Shared by both halves of a chain, so `.response()` reads the same before a
 * verb has been named and after.
 */
function refinements(state: BuilderState, next: (updated: BuilderState) => AnyBuilder): AnyBuilder {
  return {
    response: (schema?: StandardSchemaV1) => next(withSlot(state, "response", schema)),
    variables: (schema?: StandardSchemaV1) => next(withSlot(state, "variables", schema)),
    send: (schema?: StandardSchemaV1) => next(withSlot(state, "send", schema)),
    use: (...middleware: Middleware[]) => next(withMiddleware(state, middleware)),
    headers: (names: readonly string[]) => next(withHeaders(state, names)),
    timeout: (ms: number) => next(withValue(state, "timeout", ms)),
    retry: (options: RetryOptions) => next(withValue(state, "retry", options)),
    meta: (values: Record<string, unknown>) => next(withMeta(state, values)),
  };
}

/**
 * An endpoint that has said where it is.
 *
 * It is a finished descriptor and a builder at once: every consumer can read
 * it as it stands, and naming a schema or an option returns another one. The
 * methods are hidden from enumeration so the descriptor reads as data.
 */
function makeAddressed(state: BuilderState, wire: Wire, options: AnyEndpointOptions): AnyBuilder {
  const next = (updated: BuilderState): AnyBuilder => makeAddressed(updated, wire, options);
  const endpoint = sealAt(state, wire, options);

  const methods: AnyBuilder = {
    ...refinements(state, next),
    cache: (config: CacheConfig) => {
      if (state.kind !== "query") {
        throw new ConfigurationError(
          "CACHE_ON_WRITE",
          `[courier] .cache() was named on an endpoint addressed with .${wire.method}(), which ` +
            "writes — remove it, or declare the endpoint a read with .reads()",
        );
      }
      return next(withValue(state, "cache", config));
    },
    reads: () => next({ ...state, kind: "query" }),
  };

  for (const [name, method] of Object.entries(methods)) {
    Object.defineProperty(endpoint, name, { value: method, enumerable: false });
  }
  return endpoint;
}

/**
 * An endpoint that has not yet said where it is.
 *
 * Naming a verb moves it to the addressed half; every other method returns
 * another of these, so the slots may be named on either side of the verb.
 */
function makeBuilder(state: BuilderState): AnyBuilder {
  const next = (updated: BuilderState): AnyBuilder => makeBuilder(updated);
  const address = (method: HttpMethod, path: string, options: AnyEndpointOptions): AnyBuilder =>
    makeAddressed(
      { ...state, kind: kindFor(state.kind, method) },
      {
        method,
        path,
        probe: ((w: Record<string, (...a: unknown[]) => unknown>, v: unknown) =>
          w[method]?.(path, v)) as unknown as AnyProbe,
        served: false,
      },
      options,
    );

  const verbs: AnyBuilder = {};
  for (const method of VERBS) {
    verbs[method] = (path = "", options: AnyEndpointOptions = {}) => address(method, path, options);
  }
  verbs.connect = (path = "", options: AnyEndpointOptions = {}) => address("get", path, options);

  /* An HTTP endpoint describes its answer only once a verb has said there is
     one, so nothing but `.variables()` — which a closure has to be written
     against — is offered before it. A stream or a channel has no verb to
     choose, so it keeps every slot. */
  const all = refinements(state, next);
  const { variables, use, headers, timeout, retry, meta } = all;
  const available =
    state.kind === "query" || state.kind === "mutation"
      ? { variables, use, headers, timeout, retry, meta }
      : all;

  return {
    ...available,
    ...verbs,
    via: (probe: AnyProbe, options: AnyEndpointOptions = {}) => {
      const shape = probeWire(probe);
      /* The closure hides its verb, so the endpoint is taken to write until
         `.reads()` says otherwise — a write served over a cacheable GET is the
         dangerous mistake, not the reverse. */
      return makeAddressed(
        { ...state, kind: state.kind === "query" ? "mutation" : state.kind },
        { method: shape.method, path: shape.path, probe, served: false },
        options,
      );
    },
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
    endpoint: head("query", inherited) as unknown as HttpBuilder<void, void>,
    stream: head("stream", inherited) as unknown as StreamBuilder<void, void, void>,
    channel: head("channel", inherited) as unknown as ChannelBuilder<void, void, void, never>,
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
 * const { endpoint } = vendor;
 *
 * export const getUser = endpoint.get(":id").variables(ById).response(UserSchema);
 * ```
 */
export function courier(config: CourierConfig = {}): Courier {
  return makeBase(inheritedFrom(config));
}
