import { byFixedQuery } from "./fixed-query";
import type { MappedEndpoint } from "./prefix-route-types";
import { specificity } from "./segment-template";

/**
 * The order a mock server tries its endpoints' routes in, an HTTP
 * endpoint's, a stream's and a channel's alike: the more specific path
 * first, as `specificity` ranks it, and at one path the endpoint whose path
 * fixes a query, so that the other takes only what is left.
 *
 * @param routedAt - The path an endpoint's route is at
 * @returns A comparator that sorts the endpoint tried first before the other
 * @example
 * ```ts
 * streams.sort(byRouteOrder((ep) => ep.path || ep.name)); // `rooms/:id` before `rooms/{+name}`
 * ```
 */
export function byRouteOrder(
  routedAt: (ep: MappedEndpoint) => string,
): (a: MappedEndpoint, b: MappedEndpoint) => number {
  return (a, b) =>
    specificity(routedAt(a)).localeCompare(specificity(routedAt(b))) || byFixedQuery(a, b);
}
