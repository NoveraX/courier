import type { DefinedApi } from "@noverax/nexus/define";

/**
 * Creates a type-safe query key factory for manual cache invalidation.
 *
 * @example
 * ```ts
 * const key = createQueryKeys<typeof api>("api");
 * key("users")                          // → ["api", "users"]
 * key("users", "getAll")               // → ["api", "users", "getAll"]
 * key("users", "getById", { id: 1 })   // → ["api", "users", "getById", { id: 1 }]
 * ```
 */
export function createQueryKeys<T extends DefinedApi<any>>(source: string) {
  type Groups = T["options"]["groups"];
  type GroupKeys = keyof Groups & string;

  function queryKey<G extends GroupKeys>(group: G): readonly [string, G];
  function queryKey<G extends GroupKeys, M extends Exclude<keyof Groups[G], "options"> & string>(
    group: G,
    method: M,
  ): readonly [string, G, M];
  function queryKey<G extends GroupKeys, M extends Exclude<keyof Groups[G], "options"> & string>(
    group: G,
    method: M,
    variables: Record<string, unknown>,
  ): readonly [string, G, M, Record<string, unknown>];
  function queryKey(group: string, method?: string, variables?: Record<string, unknown>) {
    if (method === undefined) return [source, group] as const;
    if (variables !== undefined) return [source, group, method, variables] as const;
    return [source, group, method] as const;
  }

  return queryKey;
}
