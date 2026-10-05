import type { MockServer } from "./mock-server-types";

const GENERATED = new WeakMap<MockServer, Set<string>>();

/**
 * The routes a mock server answers with handlers it generated itself, from
 * an API source, as `group/method` keys — so a handler of the user's on
 * the same route reads as an override, and one on a route with nothing
 * generated (a stream, a hand-written server's route) does too.
 *
 * @param server - The server
 * @returns Its generated routes, which the auto server fills
 * @example
 * ```ts
 * generatedRoutes(server).add(routeKey("users", "getAll"));
 * ```
 */
export function generatedRoutes(server: MockServer): Set<string> {
  let routes = GENERATED.get(server);
  if (!routes) {
    routes = new Set();
    GENERATED.set(server, routes);
  }
  return routes;
}

/**
 * A route's key, as {@link generatedRoutes} holds it.
 *
 * @param group - The route's group
 * @param method - The route's endpoint
 * @returns The key
 * @example
 * ```ts
 * routeKey("users", "getAll"); // "users/getAll"
 * ```
 */
export function routeKey(group: string, method: string): string {
  return `${group}/${method}`;
}
