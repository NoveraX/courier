/**
 * What pages see as it happens: the traffic of the apps and the mocks.
 *
 * A page opened from Studio's link sees each event whole, as the developer
 * sent it. Any other page — or a process on the machine that reached Studio
 * without the token, another account's — sees it as Studio writes it down,
 * each credential's value replaced, and what the call carried as an export
 * carries it: it still sees every request, but not the `Authorization` or
 * the cookies they carried, nor a value of the variables, the answer or a
 * stream message's preview that Courier's rule for a name hides.
 */

import type { Namespace, Socket } from "socket.io";

import { toOpenPages, toPage } from "./page-outlet";

/**
 * Send events to every page, in one message: whole to the pages with the
 * token, without their credentials to the others. A room no page is in is
 * sent nothing — Studio encodes each message for its room before it looks
 * who is in it, and most of the time no page is open.
 *
 * @param uiNamespace - The pages' namespace
 * @param events - The events, whole, in the order they happened
 * @example
 * ```ts
 * emitLiveEvents(uiNamespace, [{ type: "request:start", id: "r1", headers: { authorization: "Bearer t" } }]);
 * ```
 */
export function emitLiveEvents(
  uiNamespace: Namespace,
  events: readonly Record<string, unknown>[],
): void {
  if (events.length === 0) return;
  toOpenPages(uiNamespace, "events", events);
}

/**
 * Send an event to one page, as `emitLiveEvents` sends it to the page's
 * room: whole when the page presented the token, without its credentials
 * otherwise.
 *
 * @param socket - The page's socket
 * @param event - The event, whole
 * @example
 * ```ts
 * emitLiveEventTo(socket, { type: "mock:server:connect", serverId: "api" });
 * ```
 */
export function emitLiveEventTo(socket: Socket, event: Record<string, unknown>): void {
  toPage(socket, "events", [event]);
}
