import type { DefinedGroup, DefineGroupConfig, EndpointRecord } from "./types";

/**
 * Define an endpoint group with a prefix and typed endpoints.
 *
 * @example
 * const api = courier()
 *
 * const users = defineGroup({
 *   prefix: "users",
 *   endpoints: {
 *     getAll: api.query.response(UserListSchema).via((http) => http.get()),
 *     getById: api.query
 *       .variables(ByIdSchema)
 *       .response(UserSchema)
 *       .via((http, vars) => http.get(":id", vars)),
 *   },
 * })
 */
export function defineGroup<TEndpoints extends EndpointRecord>(
  config: DefineGroupConfig<TEndpoints>,
): DefinedGroup<TEndpoints> {
  const { endpoints, ...groupOptions } = config;
  return Object.assign({ options: groupOptions }, endpoints);
}
