import { GROUP_PATH_SEPARATOR } from "@noverax/courier/internal";
import type { QueryKey } from "@tanstack/react-query";

/**
 * The last element of every infinite query's key.
 *
 * An infinite query caches `{ pages, pageParams }` where a plain query of the
 * same endpoint caches one page, so the two must never meet on one key —
 * a `useQuery` reading the other's entry would render the wrong shape.
 */
export const INFINITE_KEY_MARKER = "infinite";

/**
 * The elements a group's path takes in a key, one per group from the top:
 * `billing.invoices` is `["billing", "invoices"]`, so a key that names the
 * outer group is a prefix of every key inside it.
 *
 * @param group - The group's path
 * @returns Its names, in order
 * @example
 * groupKeyParts("billing.invoices"); // ["billing", "invoices"]
 */
export function groupKeyParts(group: string): string[] {
  return group.split(GROUP_PATH_SEPARATOR);
}

/**
 * The cache key of a plain query: `[source, ...group, method, variables?]`,
 * the group's path one element per group.
 *
 * @param source - Source name the caller was created for
 * @param group - The API group's path
 * @param method - Endpoint method name
 * @param variables - The call's variables, left out of the key when absent
 * @returns The hierarchical key, so a prefix invalidates a method, a group,
 *   or a group and every group inside it
 * @example
 * buildQueryKey("api", "users", "getById", { id: 1 }); // ["api", "users", "getById", { id: 1 }]
 * buildQueryKey("api", "billing.invoices", "list"); // ["api", "billing", "invoices", "list"]
 */
export function buildQueryKey(
  source: string,
  group: string,
  method: string,
  variables?: unknown,
): QueryKey {
  const at = [source, ...groupKeyParts(group), method];
  return variables !== undefined ? [...at, variables] : at;
}

/**
 * The cache key of an infinite query:
 * `[source, ...group, method, firstPageVariables?, "infinite"]`.
 *
 * The first page's variables stand for the whole list: whatever else the
 * variables carry besides the page parameter — a filter, a search term —
 * selects a different list, and each list needs its own entry.
 *
 * @param source - Source name the caller was created for
 * @param group - API group name
 * @param method - Endpoint method name
 * @param firstPageVariables - The variables the first page is fetched with
 * @returns A key under the method's prefix that no plain query can share
 * @example
 * buildInfiniteQueryKey("api", "posts", "list", { cursor: 0, tag: "a" });
 * // ["api", "posts", "list", { cursor: 0, tag: "a" }, "infinite"]
 */
export function buildInfiniteQueryKey(
  source: string,
  group: string,
  method: string,
  firstPageVariables: unknown,
): QueryKey {
  return [...buildQueryKey(source, group, method, firstPageVariables), INFINITE_KEY_MARKER];
}
