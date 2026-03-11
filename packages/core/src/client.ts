import type { DefinedApi, Endpoint, EndpointRecord, GroupRecord } from "./define/types";
import type { CallOptions, HttpResponse } from "./http-client/types";

// ── Public Types ──────────────────────────────────────────────────────────────

/** Options for .with() — all CallOptions except rawData (controlled via .raw) */
export type WithOptions = Omit<CallOptions, "rawData">;

/** Return type based on Raw flag */
type EndpointReturn<R, Raw extends boolean> = Promise<
  Raw extends true ? Partial<HttpResponse<R>> : R
>;

/** Typed method signature — adapts based on whether variables are required */
type EndpointMethod<R, V, Raw extends boolean> = [V] extends [undefined]
  ? () => EndpointReturn<R, Raw>
  : {} extends V
    ? (variables?: V) => EndpointReturn<R, Raw>
    : (variables: V) => EndpointReturn<R, Raw>;

/** Methods exposed on a group client (excludes 'options' from the group) */
type GroupMethods<G, Raw extends boolean> = {
  [K in keyof G as K extends "options" ? never : K]: G[K] extends Endpoint<infer R, infer V>
    ? EndpointMethod<R, V, Raw>
    : never;
};

/** Conditionally expose .raw only when not already in raw mode */
type RawAccessor<Client> = { raw: Client };

/** A group with typed methods, .raw accessor, and .with() */
export type GroupClient<G, Raw extends boolean = false> = GroupMethods<G, Raw> &
  (Raw extends true ? unknown : RawAccessor<GroupClient<G, true>>) & {
    with(options: WithOptions): GroupClient<G, Raw>;
  };

/** Extract groups from a DefinedApi */
type ApiGroups<T extends DefinedApi<any>> = T["options"]["groups"];

/** Flat endpoint — callable function with .raw and .with() support */
type FlatEndpointMethod<R, V, Raw extends boolean> = EndpointMethod<R, V, Raw> &
  (Raw extends true ? unknown : RawAccessor<FlatEndpointMethod<R, V, true>>) & {
    with(options: WithOptions): FlatEndpointMethod<R, V, Raw>;
  };

/** Flat endpoint methods at root level */
type FlatMethods<E, Raw extends boolean> = {
  [K in keyof E as K extends "options" ? never : K]: E[K] extends Endpoint<infer R, infer V>
    ? FlatEndpointMethod<R, V, Raw>
    : never;
};

/** Client for flat API (no groups) */
export type FlatClient<E extends EndpointRecord, Raw extends boolean = false> = FlatMethods<
  E,
  Raw
> &
  (Raw extends true ? unknown : RawAccessor<FlatClient<E, true>>) & {
    with(options: WithOptions): FlatClient<E, Raw>;
  };

/** Client for grouped API */
export type TypedClient<T extends DefinedApi<any>, Raw extends boolean = false> = {
  [K in keyof ApiGroups<T>]: GroupClient<ApiGroups<T>[K], Raw>;
} & (Raw extends true ? unknown : RawAccessor<TypedClient<T, true>>) & {
    with(options: WithOptions): TypedClient<T, Raw>;
  };

/** Client for mixed API (groups + flat endpoints) */
export type MixedClient<
  G extends GroupRecord,
  E extends EndpointRecord,
  Raw extends boolean = false,
> = {
  [K in keyof G]: GroupClient<G[K], Raw>;
} & FlatMethods<E, Raw> &
  (Raw extends true ? unknown : RawAccessor<MixedClient<G, E, true>>) & {
    with(options: WithOptions): MixedClient<G, E, Raw>;
  };

/**
 * Infer the correct client type from a source definition type.
 * Used by createProxyCaller where the source type is passed as a generic.
 *
 * - DefinedApi<G>       → TypedClient<T>
 * - DefinedFlatApi<E>   → FlatClient<E>
 * - DefinedMixedApi<G,E>→ MixedClient<G, E>
 */
export type InferClient<T> = T extends { options: { groups: infer G extends GroupRecord } }
  ? [keyof Omit<T, "options">] extends [never]
    ? TypedClient<T & DefinedApi<G>>
    : MixedClient<G, Omit<T, "options"> & EndpointRecord>
  : FlatClient<Omit<T, "options"> & EndpointRecord>;

// ── Execution backend ─────────────────────────────────────────────────────────

/** Function that performs the actual request (implemented differently for direct/proxy modes) */
export type ExecuteBackend = (
  group: string,
  method: string,
  variables: unknown,
  options: Record<string, unknown>,
  raw: boolean,
) => Promise<unknown>;

// ── Proxy factory ─────────────────────────────────────────────────────────────

function shouldPassthrough(prop: string | symbol): boolean {
  if (typeof prop === "symbol") return true;
  return prop === "then" || prop === "toJSON" || prop === "valueOf" || prop === "$$typeof";
}

/**
 * Dual proxy: callable as flat endpoint, accessible as group.
 * `client.method(vars)` → flat call; `client.group.method(vars)` → group call.
 */
function createDualProxy(
  backend: ExecuteBackend,
  name: string,
  options: Record<string, unknown>,
  raw: boolean,
): unknown {
  const callFlat = (variables?: unknown) => backend("", name, variables, options, raw);

  return new Proxy(callFlat, {
    get(_, prop) {
      if (shouldPassthrough(prop)) return undefined;
      if (prop === "raw") return createDualProxy(backend, name, options, true);
      if (prop === "with") {
        return (newOptions: Record<string, unknown>) =>
          createDualProxy(backend, name, { ...options, ...newOptions }, raw);
      }
      /* Nested access → treat `name` as group, `prop` as method */
      return (variables?: unknown) => backend(name, prop as string, variables, options, raw);
    },
    apply(target, _, args) {
      return target(args[0]);
    },
  });
}

/** Build a Proxy-based typed client from an execution backend */
export function buildClientProxy(
  backend: ExecuteBackend,
  options: Record<string, unknown> = {},
  raw = false,
): unknown {
  return new Proxy(Object.create(null), {
    get(_, prop) {
      if (shouldPassthrough(prop)) return undefined;

      if (prop === "raw") {
        return buildClientProxy(backend, options, true);
      }
      if (prop === "with") {
        return (newOptions: Record<string, unknown>) =>
          buildClientProxy(backend, { ...options, ...newOptions }, raw);
      }

      return createDualProxy(backend, prop as string, options, raw);
    },
  });
}
