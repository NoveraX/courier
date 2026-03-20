import type { DefinedGroup, DefineGroupConfig, EndpointRecord } from "./types";

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
export function defineGroup<TEndpoints extends EndpointRecord>(
  config: DefineGroupConfig<TEndpoints>,
): DefinedGroup<TEndpoints> {
  const { endpoints, ...groupOptions } = config;
  return Object.assign({ options: groupOptions }, endpoints);
}
