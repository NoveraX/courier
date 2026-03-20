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
export function createQueryKeys<TApi extends DefinedApi<any>>(source: string) {
  type Groups = TApi["options"]["groups"];
  type GroupKeys = keyof Groups & string;

  function queryKey<TGroup extends GroupKeys>(group: TGroup): readonly [string, TGroup];
  function queryKey<
    TGroup extends GroupKeys,
    TMethod extends Exclude<keyof Groups[TGroup], "options"> & string,
  >(group: TGroup, method: TMethod): readonly [string, TGroup, TMethod];
  function queryKey<
    TGroup extends GroupKeys,
    TMethod extends Exclude<keyof Groups[TGroup], "options"> & string,
  >(
    group: TGroup,
    method: TMethod,
    variables: Record<string, unknown>,
  ): readonly [string, TGroup, TMethod, Record<string, unknown>];
  function queryKey(group: string, method?: string, variables?: Record<string, unknown>) {
    if (method === undefined) return [source, group] as const;
    if (variables !== undefined) return [source, group, method, variables] as const;
    return [source, group, method] as const;
  }

  return queryKey;
}
