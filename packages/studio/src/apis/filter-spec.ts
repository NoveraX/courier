import type { CourierImportSelector } from "@noverax/courier/config";
import { groupsHoldingEndpoints } from "./generator/groups-holding-endpoints";
import type { ParsedEndpoint, ParsedSpec } from "./parser/types";

/* Whether a selector names the endpoint: by a tag it carries, its path as the spec writes it, or its operationId. */
function names(selector: CourierImportSelector, endpoint: ParsedEndpoint): boolean {
  const { tags = [], paths = [], operationIds = [] } = selector;
  return (
    endpoint.tags.some((tag) => tags.includes(tag)) ||
    paths.includes(endpoint.fullPath) ||
    (endpoint.operationId !== null && operationIds.includes(endpoint.operationId))
  );
}

/**
 * Keep the endpoints of a specification that an import's `include` and
 * `exclude` select: with an `include`, only those it names; then, without
 * those `exclude` names. A selector names an endpoint by one of its tags,
 * by its path as the specification writes it (`/pets/{id}`), or by its
 * operationId. A group left with no endpoint goes, unless a group inside it
 * keeps one — OpenAPI 3.2 generates a group in its parent's; the schemas stay.
 *
 * @param spec - The specification as parsed
 * @param include - The endpoints to keep, if the import names any
 * @param exclude - The endpoints to leave out, if the import names any
 * @returns The specification with only the selected endpoints
 * @example
 * ```ts
 * filterSpec(spec, { operationIds: ["getPetById"] }, { tags: ["store"] });
 * ```
 */
export function filterSpec(
  spec: ParsedSpec,
  include: CourierImportSelector | undefined,
  exclude: CourierImportSelector | undefined,
): ParsedSpec {
  if (include === undefined && exclude === undefined) return spec;
  const kept = (endpoint: ParsedEndpoint): boolean =>
    (include === undefined || names(include, endpoint)) &&
    (exclude === undefined || !names(exclude, endpoint));
  const groups = spec.groups.map((group) => ({
    ...group,
    endpoints: group.endpoints.filter(kept),
  }));
  const held = groupsHoldingEndpoints(groups);
  return { ...spec, groups: groups.filter((group) => held.has(group.name)) };
}
