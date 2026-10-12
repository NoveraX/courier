/**
 * What pages see as it happens: the traffic of the apps and the mocks.
 *
 * A page opened from Studio's link sees each event whole, as the developer
 * sent it. Any other page — or a process on the machine that reached Studio
 * without the token, another account's — sees it as Studio writes it down,
 * each credential's value replaced: it still sees every request, but not the
 * `Authorization` or the cookies they carried.
 */

import type { Namespace, Socket } from "socket.io";

import { withoutCredentials } from "./storage/without-credentials";

/** The room of the pages that presented the project's token. */
export const TOKEN_PAGES = "pages:token";

/** The room of every other page. */
export const READ_ONLY_PAGES = "pages:read-only";

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
  if (hasPages(uiNamespace, TOKEN_PAGES)) uiNamespace.to(TOKEN_PAGES).emit("events", events);
  if (hasPages(uiNamespace, READ_ONLY_PAGES)) {
    uiNamespace.to(READ_ONLY_PAGES).emit("events", events.map(withoutCredentials));
  }
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
  socket.emit("events", [socket.rooms.has(TOKEN_PAGES) ? event : withoutCredentials(event)]);
}

function hasPages(uiNamespace: Namespace, room: string): boolean {
  return (uiNamespace.adapter.rooms.get(room)?.size ?? 0) > 0;
}
