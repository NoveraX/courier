import type { DefinedApi, Endpoint } from "./define/types";
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

/** A group with typed methods, .raw accessor, and .with() */
export type GroupClient<G, Raw extends boolean = false> = GroupMethods<G, Raw> & {
  /** Access all methods with full HttpResponse return type */
  raw: GroupClient<G, true>;
  /** Create a new group client with merged options */
  with(options: WithOptions): GroupClient<G, Raw>;
};

/** Extract groups from a DefinedApi */
type ApiGroups<T extends DefinedApi<any>> = T["options"]["groups"];

/** The main typed client returned by createCaller / createProxyCaller */
export type TypedClient<T extends DefinedApi<any>, Raw extends boolean = false> = {
  [K in keyof ApiGroups<T>]: GroupClient<ApiGroups<T>[K], Raw>;
} & {
  /** Access all groups with full HttpResponse return type */
  raw: TypedClient<T, true>;
  /** Create a new client with merged options */
  with(options: WithOptions): TypedClient<T, Raw>;
};

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
  // Prevent thenable detection by await, and other non-API access
  return prop === "then" || prop === "toJSON" || prop === "valueOf" || prop === "$$typeof";
}

function createGroupProxy(
  backend: ExecuteBackend,
  groupName: string,
  options: Record<string, unknown>,
  raw: boolean,
): unknown {
  return new Proxy(Object.create(null), {
    get(_, prop) {
      if (shouldPassthrough(prop)) return undefined;

      if (prop === "raw") {
        return createGroupProxy(backend, groupName, options, true);
      }
      if (prop === "with") {
        return (newOptions: Record<string, unknown>) =>
          createGroupProxy(backend, groupName, { ...options, ...newOptions }, raw);
      }

      // Method name → return endpoint function
      return (variables?: unknown) => backend(groupName, prop as string, variables, options, raw);
    },
  });
}

/** Build a Proxy-based typed client from an execution backend */
export function buildClientProxy<T extends DefinedApi<any>>(
  backend: ExecuteBackend,
  options: Record<string, unknown> = {},
  raw = false,
): TypedClient<T> {
  return new Proxy(Object.create(null), {
    get(_, prop) {
      if (shouldPassthrough(prop)) return undefined;

      if (prop === "raw") {
        return buildClientProxy<T>(backend, options, true);
      }
      if (prop === "with") {
        return (newOptions: Record<string, unknown>) =>
          buildClientProxy<T>(backend, { ...options, ...newOptions }, raw);
      }

      // Group name → return group proxy
      return createGroupProxy(backend, prop as string, options, raw);
    },
  }) as TypedClient<T>;
}
