import type { BaseOptions } from "../instance/types";
import type {
  DefinedApi,
  DefinedGroup,
  DefineGroupConfig,
  Endpoint,
  EndpointRecord,
  GroupRecord,
} from "./types";

export type {
  AnySource,
  DefinedApi,
  DefinedGroup,
  DefineGroupConfig,
  Endpoint,
  EndpointRecord,
  GroupRecord,
  Sources,
} from "./types";

/**
 * Type-safe endpoint definition helper.
 * Uses double-call pattern for partial generic inference.
 *
 * @example
 * endpoint<User[]>()((http) => http.get())
 * endpoint<User, { id: string }>()((http, vars) => http.get(":id", vars))
 */
export function endpoint<R, V = undefined>(): (fn: Endpoint<R, V>) => Endpoint<R, V> {
  return (fn) => fn;
}

/**
 * Define an endpoint group with a prefix and typed endpoints.
 *
 * @example
 * const users = defineGroup({
 *   prefix: "users",
 *   endpoints: {
 *     getAll: endpoint<User[]>()((http) => http.get()),
 *     getById: endpoint<User, { id: string }>()((http, vars) => http.get(":id", vars)),
 *   },
 * })
 */
export function defineGroup<E extends EndpointRecord>(
  config: DefineGroupConfig<E>,
): DefinedGroup<E> {
  const { endpoints, ...groupOptions } = config;
  return Object.assign({ options: groupOptions }, endpoints);
}

/**
 * Define an API source with groups of typed endpoints.
 *
 * @example
 * const api = defineApi({
 *   baseURL: "https://api.example.com",
 *   groups: {
 *     users: usersGroup,
 *     posts: postsGroup,
 *   },
 * })
 */
export function defineApi<G extends GroupRecord>(
  config: BaseOptions & { groups: G },
): DefinedApi<G> {
  return { options: config };
}
