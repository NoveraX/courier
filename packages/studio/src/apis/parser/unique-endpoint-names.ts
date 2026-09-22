/**
 * Give every endpoint in a group a name of its own.
 *
 * Short names like `getById` or `create` read well while a group holds one
 * resource, which is what a tagged specification produces. A specification
 * that tags nothing puts every operation in a single group: DigitalOcean's
 * 684 operations carry neither tags nor operation ids and collapsed onto 67
 * names, `getById` alone claimed by 201 of them. The generated object literal
 * then declared the same key hundreds of times — it did not compile, and each
 * definition quietly replaced the one before it.
 *
 * A name that is already unique is left exactly as it was. Only a colliding
 * one is rebuilt from the path it serves, so the short names survive wherever
 * they were never ambiguous.
 */

import { toCamelCase } from "./naming-utils";
import type { ParsedEndpoint } from "./types";

/**
 * Rename only those endpoints whose names collide within the group.
 *
 * @param endpoints - Endpoints of one group, in specification order
 * @param prefix - Path shared by the whole group, dropped from built names
 * @returns The same endpoints, each with a name no sibling shares
 *
 * @example
 * ```ts
 * // GET /v2/account/keys and GET /v2/account/keys/{id} both arrive as
 * // "getAll" and "getById"; with prefix "/v2" they stay distinct as
 * // "getAccountKeys" and "getAccountKeysById".
 * uniqueEndpointNames(endpoints, "/v2");
 * ```
 */
export function uniqueEndpointNames(endpoints: ParsedEndpoint[], prefix = ""): ParsedEndpoint[] {
  const occurrences = new Map<string, number>();
  for (const endpoint of endpoints) {
    occurrences.set(endpoint.name, (occurrences.get(endpoint.name) ?? 0) + 1);
  }

  const taken = new Set<string>();
  for (const [name, count] of occurrences) {
    if (count === 1) taken.add(name);
  }

  return endpoints.map((endpoint) => {
    if ((occurrences.get(endpoint.name) ?? 0) === 1) return endpoint;

    const candidate = nameFromPath(endpoint, prefix);
    const name = settle(candidate, taken);
    taken.add(name);
    return { ...endpoint, name };
  });
}

/** Build a name that says which path this endpoint serves. */
function nameFromPath(endpoint: ParsedEndpoint, prefix: string): string {
  const path = endpoint.fullPath.startsWith(prefix)
    ? endpoint.fullPath.slice(prefix.length)
    : endpoint.fullPath;

  const segments = path
    .split("/")
    .filter((segment) => segment && !segment.startsWith("{") && !segment.startsWith(":"));

  const base = toCamelCase([endpoint.httpMethod, ...segments].join("_"));
  /* Two operations on the same resource differ only by taking a parameter —
     `GET /keys` and `GET /keys/{id}` would otherwise land on one name. */
  const addressesOne = path.includes("{") || path.includes(":");
  return addressesOne ? `${base}ById` : base;
}

/** Last resort: a name the path could not make unique gets a number. */
function settle(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name}${n}`)) n += 1;
  return `${name}${n}`;
}
