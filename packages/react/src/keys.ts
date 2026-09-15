import type { DefinedApi } from "@noverax/courier/define";
import { getSourceName } from "@noverax/courier/define";

type Groups<TApi extends DefinedApi<any>> = TApi["options"]["groups"];
type GroupKey<TApi extends DefinedApi<any>> = keyof Groups<TApi> & string;
type MethodKey<TApi extends DefinedApi<any>, TGroup extends GroupKey<TApi>> = Exclude<
  keyof Groups<TApi>[TGroup],
  "options"
> &
  string;

/**
 * Type-safe query key factory returned by `createQueryKeys` and `createProxyQueryKeys`.
 *
 * Returns hierarchical react-query keys: `[source, group, method?, variables?]`.
 * Use for cache invalidation, prefetching, and optimistic updates.
 */
export interface QueryKeyFactory<TApi extends DefinedApi<any>> {
  <TGroup extends GroupKey<TApi>>(group: TGroup): readonly [string, TGroup];
  <TGroup extends GroupKey<TApi>, TMethod extends MethodKey<TApi, TGroup>>(
    group: TGroup,
    method: TMethod,
  ): readonly [string, TGroup, TMethod];
  <TGroup extends GroupKey<TApi>, TMethod extends MethodKey<TApi, TGroup>>(
    group: TGroup,
    method: TMethod,
    variables: Record<string, unknown>,
  ): readonly [string, TGroup, TMethod, Record<string, unknown>];
}

function buildKeyFactory<TApi extends DefinedApi<any>>(source: string): QueryKeyFactory<TApi> {
  function queryKey(group: string, method?: string, variables?: Record<string, unknown>) {
    if (method === undefined) return [source, group] as const;
    if (variables !== undefined) return [source, group, method, variables] as const;
    return [source, group, method] as const;
  }
  return queryKey as QueryKeyFactory<TApi>;
}

/**
 * Create a type-safe query key factory for **direct mode**.
 *
 * Mirrors `createQueryCaller(api)` — accepts the API definition object directly,
 * extracts the source name via `getSourceName()`. Use when you ship the API
 * definition to the client (SPAs, React Native, internal tools).
 *
 * @example
 * ```ts
 * import { createQueryCaller, createQueryKeys } from "@noverax/courier-react";
 * import { api } from "@/shared/api";
 *
 * export const q = createQueryCaller(api);
 * export const queryKeys = createQueryKeys(api);
 *
 * queryKeys("users")                          // → ["api", "users"]
 * queryKeys("users", "getAll")                // → ["api", "users", "getAll"]
 * queryKeys("users", "getById", { id: 1 })    // → ["api", "users", "getById", { id: 1 }]
 *
 * queryClient.invalidateQueries({ queryKey: queryKeys("users") });
 * ```
 */
export function createQueryKeys<TApi extends DefinedApi<any>>(api: TApi): QueryKeyFactory<TApi> {
  const source = getSourceName(api) ?? "_";
  return buildKeyFactory<TApi>(source);
}

/**
 * Create a type-safe query key factory for **proxy mode**.
 *
 * Mirrors `createProxyQueryCaller<T>("name")` — accepts a string source name
 * matching the key in server-side `apiRoute({ [source]: ... })`. Use when the
 * API definition lives on the server only and the client never imports it.
 *
 * @example
 * ```ts
 * import { createProxyQueryCaller, createProxyQueryKeys } from "@noverax/courier-react";
 * import type { Api } from "@/shared/api";
 *
 * export const q = createProxyQueryCaller<Api>("api");
 * export const queryKeys = createProxyQueryKeys<Api>("api");
 *
 * queryKeys("users")                          // → ["api", "users"]
 * queryKeys("users", "getAll")                // → ["api", "users", "getAll"]
 * queryKeys("users", "getById", { id: 1 })    // → ["api", "users", "getById", { id: 1 }]
 * ```
 */
export function createProxyQueryKeys<TApi extends DefinedApi<any>>(
  source: string,
): QueryKeyFactory<TApi> {
  return buildKeyFactory<TApi>(source);
}
