import { convertPathParams } from "./path-utils";
import type { ParsedEndpoint, ParsedGroup } from "./types";
import { uniqueEndpointNames } from "./unique-endpoint-names";

/**
 * The key an API's own endpoints — those in no group — are listed under,
 * in a specification, a selection and an import's listing alike. No group
 * can take it: a group is named by an identifier.
 */
export const TOP_LEVEL = "";

/**
 * The endpoints that sit in the API itself, beside its groups: called as
 * `client.health()` rather than through a group. Each gets a name no other
 * endpoint of the API itself has, and its whole path, as there is no group
 * prefix for it to be relative to.
 *
 * @param endpoints - The endpoints, in specification order
 * @returns The API's own endpoints, listed as a group under {@link TOP_LEVEL}
 * @example
 * ```ts
 * topLevelGroup([health]).endpoints[0]?.path; // "/health"
 * ```
 */
export function topLevelGroup(endpoints: ParsedEndpoint[]): ParsedGroup {
  return {
    name: TOP_LEVEL,
    description: "",
    prefix: "",
    endpoints: uniqueEndpointNames(endpoints).map((endpoint) => ({
      ...endpoint,
      path: convertPathParams(endpoint.fullPath),
    })),
  };
}

/**
 * Tell whether a group is the API's own endpoints rather than a group.
 *
 * @param group - The group, or its name
 * @returns Whether it is listed under {@link TOP_LEVEL}
 * @example
 * ```ts
 * isTopLevel(""); // true
 * isTopLevel({ name: "pets" }); // false
 * ```
 */
export function isTopLevel(group: string | { name: string }): boolean {
  return (typeof group === "string" ? group : group.name) === TOP_LEVEL;
}

/**
 * An endpoint's name as a client reaches it: through its group, or on its
 * own for one of the API itself.
 *
 * @param group - The group's name; {@link TOP_LEVEL} for the API itself
 * @param endpoint - The endpoint's name
 * @returns `group.endpoint`, or `endpoint` alone
 * @example
 * ```ts
 * qualifiedName("pets", "list"); // "pets.list"
 * qualifiedName("", "health"); // "health"
 * ```
 */
export function qualifiedName(group: string, endpoint: string): string {
  return isTopLevel(group) ? endpoint : `${group}.${endpoint}`;
}
