import type { MockRouteEntry, MockServerInfo } from "@/store/mock-slice";

/**
 * A route's endpoint as a mock's `endpoints` list names it: `group.method`,
 * or the method alone outside any group.
 *
 * @param route - The route
 * @returns Its name
 * @example
 * ```ts
 * endpointNameOf({ group: "orders", endpoint: "refund", … }); // → "orders.refund"
 * ```
 */
export function endpointNameOf(route: Pick<MockRouteEntry, "group" | "endpoint">): string {
  return route.group ? `${route.group}.${route.endpoint}` : route.endpoint;
}

/**
 * The endpoints a mock declared in `courier.mocks.ts` leaves to its
 * source's server — those its `endpoints` list does not name — which Add
 * to mock can add to the list. A mock Studio does not manage has none it
 * can add to.
 *
 * @param server - The mock
 * @returns The endpoints' names, in the order of its routes
 * @example
 * ```ts
 * leftToServer(server); // → ["orders.refund"]
 * ```
 */
export function leftToServer(server: MockServerInfo): string[] {
  if (!server.managed || server.origin !== "studio") return [];
  return server.routes.filter((route) => route.source === "upstream").map(endpointNameOf);
}
