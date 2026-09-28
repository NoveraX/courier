import type { ClientConnection } from "@noverax/courier";

import { type H3EventLike, isWebEvent } from "./h3-event";

/**
 * The Node response to watch for the client leaving, where the request
 * handed to the proxy cannot say so itself.
 *
 * The proxy stops its upstream call when the request's signal fires. The
 * request h3 2.x gives a route fires it when the client goes, and so does one
 * converted from Node's own request. The Web request an h3 1.x event carries
 * when h3 served one was built by the host and may fire it never, so a call
 * the browser cancelled ran on to the end for nobody. Its event still holds
 * the Node response the answer goes out on, which closes when the client
 * leaves.
 *
 * @param event - An event from h3 1.x or 2.x
 * @returns The response to watch, or `undefined` when the request's own
 *   signal already follows the client
 *
 * @example
 * ```ts
 * handleWhileConnected(handle, await requestOfEvent(event), connectionOf(event));
 * ```
 */
export function connectionOf(event: H3EventLike): ClientConnection | undefined {
  if (isWebEvent(event) || !event.web?.request) return undefined;
  return event.node.res;
}
