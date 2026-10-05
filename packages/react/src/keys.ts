import type { DefinedApi, EndpointNamesAt, GroupAtPath, GroupPaths } from "@noverax/courier/define";
import { getSourceName } from "@noverax/courier/define";

import { buildQueryKey, groupKeyParts } from "./query-key";

type GroupKey<TApi extends DefinedApi> = GroupPaths<TApi>;
type MethodKey<TApi extends DefinedApi, TGroup extends GroupKey<TApi>> = EndpointNamesAt<
  GroupAtPath<TApi, TGroup>
>;

/** A group's path as a key's elements: `"billing.invoices"` is `["billing", "invoices"]`. */
type GroupParts<TGroup extends string> = TGroup extends `${infer THead}.${infer TRest}`
  ? [THead, ...GroupParts<TRest>]
  : [TGroup];

/**
 * Type-safe query key factory returned by `createQueryKeys` and `createProxyQueryKeys`.
 *
 * Returns hierarchical react-query keys: `[source, ...group, method?, variables?]`,
 * a group inside another named by its path — `"billing.invoices"` — and
 * keyed one element per group, so invalidating the outer group's key
 * invalidates every group inside it too.
 * Use for cache invalidation, prefetching, and optimistic updates.
 */
export interface QueryKeyFactory<TApi extends DefinedApi> {
  <TGroup extends GroupKey<TApi>>(group: TGroup): readonly [string, ...GroupParts<TGroup>];
  <TGroup extends GroupKey<TApi>, TMethod extends MethodKey<TApi, TGroup>>(
    group: TGroup,
    method: TMethod,
  ): readonly [string, ...GroupParts<TGroup>, TMethod];
  <TGroup extends GroupKey<TApi>, TMethod extends MethodKey<TApi, TGroup>>(
    group: TGroup,
    method: TMethod,
    variables: Record<string, unknown>,
  ): readonly [string, ...GroupParts<TGroup>, TMethod, Record<string, unknown>];
}

function buildKeyFactory<TApi extends DefinedApi>(source: string): QueryKeyFactory<TApi> {
  function queryKey(group: string, method?: string, variables?: Record<string, unknown>) {
    if (method === undefined) return [source, ...groupKeyParts(group)];
    return buildQueryKey(source, group, method, variables);
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
 * queryKeys("billing.invoices", "list")       // → ["api", "billing", "invoices", "list"]
 *
 * queryClient.invalidateQueries({ queryKey: queryKeys("users") });
 * queryClient.invalidateQueries({ queryKey: queryKeys("billing") }); // billing.invoices too
 * ```
 */
export function createQueryKeys<TApi extends DefinedApi>(api: TApi): QueryKeyFactory<TApi> {
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
export function createProxyQueryKeys<TApi extends DefinedApi>(
  source: string,
): QueryKeyFactory<TApi> {
  return buildKeyFactory<TApi>(source);
}
