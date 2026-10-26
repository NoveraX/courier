import { assertTransportOptions } from "../http-client/assert-transport-options";
import type { GroupOptions } from "../http-client/types";
import { assertNoFragment } from "./assert-no-fragment";
import { assertNoReservedGroupName, assertNoReservedName } from "./assert-no-reserved-name";
import type {
  DefinedGroup,
  DefinedNestingGroup,
  DefineGroupConfig,
  DefineNestingGroupConfig,
  OwnEndpoints,
  OwnGroups,
} from "./types";

/**
 * Define an endpoint group with a prefix and typed endpoints, and the groups
 * inside it.
 *
 * A group inside another is reached under its name after the outer one's —
 * `client.billing.invoices.list()` — and its prefix follows the outer
 * group's in the address. Groups nest to any depth.
 *
 * @param config - The group's prefix and other options, its `endpoints`,
 *   and the `groups` inside it
 * @returns The endpoints, with the group's options — its groups among them —
 *   beside them under `options`
 * @throws ConfigurationError `RESERVED_ENDPOINT_NAME` for an endpoint named
 *   `options`, the key the group's own settings are kept under, or a group
 *   or an endpoint named `raw` or `with`, which a client answers with its own
 *   accessors
 * @throws ConfigurationError `DOTTED_NAME` for a group or an endpoint whose
 *   name holds a dot, which separates the groups of a path
 * @throws ConfigurationError `SOURCE_TRANSPORT_INVALID` for a `fetch` or a
 *   `webSocket` that is not a function, or a `dispatcher` that is no undici
 *   `Dispatcher`
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
 *
 * const billing = defineGroup({
 *   prefix: "billing",
 *   groups: {
 *     invoices: defineGroup({ prefix: "invoices", endpoints: { list: endpoint.get("") } }),
 *   },
 * });
 * // client.billing.invoices.list() → GET /billing/invoices
 * ```
 */
export function defineGroup<
  TGroups extends OwnGroups,
  TEndpoints extends OwnEndpoints = Record<never, never>,
>(config: DefineNestingGroupConfig<TEndpoints, TGroups>): DefinedNestingGroup<TEndpoints, TGroups>;

export function defineGroup<TEndpoints extends OwnEndpoints>(
  config: DefineGroupConfig<TEndpoints>,
): DefinedGroup<TEndpoints>;

export function defineGroup(
  config: GroupOptions & { endpoints?: OwnEndpoints | undefined; groups?: OwnGroups | undefined },
): DefinedGroup | DefinedNestingGroup {
  const { endpoints = {}, ...groupOptions } = config;
  if (groupOptions.prefix) {
    assertNoFragment(
      groupOptions.prefix,
      `The group prefix ${JSON.stringify(groupOptions.prefix)}`,
    );
  }
  assertNoReservedName(endpoints, "group");
  if (groupOptions.groups) assertNoReservedGroupName(groupOptions.groups);
  assertTransportOptions(groupOptions, "group");
  return Object.assign({ options: groupOptions }, endpoints);
}
