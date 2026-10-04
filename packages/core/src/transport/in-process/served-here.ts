import type { Sources } from "../../define/types";
import { resolveEndpoint } from "../../utils/execute-resolve";
import type { StreamEndpointLocator } from "./shared";

/**
 * Whether this process serves an endpoint itself, with `.implement()` — so
 * its executor here runs it — or only calls it, at its upstream's address,
 * where a caller has to reach it as a client.
 *
 * @param sources - The sources the endpoint is looked up in
 * @param locator - Where the endpoint is
 * @returns `true` when this process serves the endpoint
 * @example
 * ```ts
 * const open = servedHere(sources, call) ? executeDirectSSE : openAsClient;
 * ```
 */
export function servedHere(sources: Sources, locator: StreamEndpointLocator): boolean {
  const dataSource = Object.hasOwn(sources, locator.source) ? sources[locator.source] : undefined;
  if (!dataSource) return false;
  return resolveEndpoint(dataSource, locator.group, locator.method).served;
}
