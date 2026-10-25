import type { MappedEndpoint } from "./prefix-route-types";

/** The query values an endpoint's path fixes, by name. */
type FixedQuery = MappedEndpoint["fixedQuery"];

/**
 * Whether a request carries the query values its endpoint's path fixes. A
 * path may write a query to tell it apart from another at the same place —
 * `responses?beta=true` — and the endpoint answers only a request that sends
 * those values; one whose path fixes none answers any.
 *
 * @param url - The request's URL, absolute or a path
 * @param fixed - The values the endpoint's path fixes
 * @returns `true` when the request carries each of them
 * @example
 * ```ts
 * carriesFixedQuery("/responses?beta=true&n=2", { beta: "true" }); // → true
 * carriesFixedQuery("/responses", { beta: "true" }); // → false
 * ```
 */
export function carriesFixedQuery(url: string, fixed: FixedQuery): boolean {
  if (fixed === undefined) return true;
  const query = new URL(url, "http://localhost").searchParams;
  return Object.entries(fixed).every(([name, value]) => query.getAll(name).includes(value));
}

/**
 * A request's variables without the values its endpoint's path fixes,
 * which no variable declares.
 *
 * @param input - The variables the request carries
 * @param fixed - The values the endpoint's path fixes
 * @returns The variables the endpoint declares
 * @example
 * ```ts
 * withoutFixedQuery({ beta: "true", id: "r1" }, { beta: "true" }); // → { id: "r1" }
 * ```
 */
export function withoutFixedQuery(
  input: Record<string, unknown>,
  fixed: FixedQuery,
): Record<string, unknown> {
  if (fixed === undefined) return input;
  return Object.fromEntries(Object.entries(input).filter(([name]) => !Object.hasOwn(fixed, name)));
}

/**
 * The order two endpoints at one path are tried in: the one whose path fixes
 * a query first, so that the other takes only what is left.
 *
 * @param a - One endpoint
 * @param b - The other
 * @returns A negative number when `a` is tried first
 * @example
 * ```ts
 * [responses, betaResponses].sort(byFixedQuery); // → [betaResponses, responses]
 * ```
 */
export function byFixedQuery(a: MappedEndpoint, b: MappedEndpoint): number {
  const fixes = (ep: MappedEndpoint) => Object.keys(ep.fixedQuery ?? {}).length;
  return fixes(b) - fixes(a);
}
