import type { EndpointKey } from "../types";

/**
 * Creates a type-safe query key factory for manual cache invalidation.
 *
 * @example
 * ```ts
 * const key = createQueryKeys<MyApi>();
 * key("api")                              // → ["api"]
 * key("api", "users:getAll")              // → ["api", "users:getAll"]
 * key("api", "users:getById", { id: 1 })  // → ["api", "users:getById", { id: 1 }]
 * ```
 */
export function createQueryKeys<T extends Record<string, any>>() {
  function queryKey<K extends keyof T & string>(source: K): readonly [K];
  function queryKey<K extends keyof T & string, Q extends EndpointKey<T[K]>>(
    source: K,
    endpoint: Q,
  ): readonly [K, Q];
  function queryKey<K extends keyof T & string, Q extends EndpointKey<T[K]>>(
    source: K,
    endpoint: Q,
    variables: Record<string, unknown>,
  ): readonly [K, Q, Record<string, unknown>];
  function queryKey(source: string, endpoint?: string, variables?: Record<string, unknown>) {
    if (endpoint === undefined) return [source] as const;
    if (variables !== undefined) return [source, endpoint, variables] as const;
    return [source, endpoint] as const;
  }

  return queryKey;
}
