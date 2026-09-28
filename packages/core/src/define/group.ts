import { assertNoReservedName } from "./assert-no-reserved-name";
import type { DefinedGroup, DefineGroupConfig, OwnEndpoints } from "./types";

/**
 * Define an endpoint group with a prefix and typed endpoints.
 *
 * @param config - The group's prefix and other options, and its `endpoints`
 * @returns The endpoints, with the group's options beside them under `options`
 * @throws ConfigurationError `RESERVED_ENDPOINT_NAME` for an endpoint named
 *   `options`, the key the group's own settings are kept under, or `raw` or
 *   `with`, which a client answers with its own accessors
 *
 * @example
 * ```ts
 * const { endpoint } = courier();
 *
 * const users = defineGroup({
 *   prefix: "users",
 *   endpoints: {
 *     getAll: endpoint.get("").response(UserListSchema),
 *     getById: endpoint.get(":id").variables(ByIdSchema).response(UserSchema),
 *   },
 * });
 * ```
 */
export function defineGroup<TEndpoints extends OwnEndpoints>(
  config: DefineGroupConfig<TEndpoints>,
): DefinedGroup<TEndpoints> {
  const { endpoints, ...groupOptions } = config;
  assertNoReservedName(endpoints, "group");
  return Object.assign({ options: groupOptions }, endpoints);
}
