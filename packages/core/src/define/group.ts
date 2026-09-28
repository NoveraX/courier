import { assertNoReservedName } from "./assert-no-reserved-name";
import type { DefinedGroup, DefineGroupConfig, OwnEndpoints } from "./types";

/**
 * Define an endpoint group with a prefix and typed endpoints.
 *
 * @throws ConfigurationError `RESERVED_ENDPOINT_NAME` for an endpoint named
 *   `options`, the key the group's own settings are kept under, or `raw` or
 *   `with`, which a client answers with its own accessors
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
export function defineGroup<TEndpoints extends OwnEndpoints>(
  config: DefineGroupConfig<TEndpoints>,
): DefinedGroup<TEndpoints> {
  const { endpoints, ...groupOptions } = config;
  assertNoReservedName(endpoints, "group");
  return Object.assign({ options: groupOptions }, endpoints);
}
