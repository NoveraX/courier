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
 * Send an event to every page: whole to the pages with the token, without
 * its credentials to the others.
 *
 * @param uiNamespace - The pages' namespace
 * @param event - The event, whole
 * @example
 * ```ts
 * emitLiveEvent(uiNamespace, { type: "request:start", id: "r1", headers: { authorization: "Bearer t" } });
 * ```
 */
export function emitLiveEvent(uiNamespace: Namespace, event: Record<string, unknown>): void {
  uiNamespace.to(TOKEN_PAGES).emit("event", event);
  uiNamespace.to(READ_ONLY_PAGES).emit("event", withoutCredentials(event));
}

/**
 * Send an event to one page, as `emitLiveEvent` sends it to the page's room:
 * whole when the page presented the token, without its credentials otherwise.
 *
 * @param socket - The page's socket
 * @param event - The event, whole
 * @example
 * ```ts
 * emitLiveEventTo(socket, { type: "mock:server:connect", serverId: "api" });
 * ```
 */
export function emitLiveEventTo(socket: Socket, event: Record<string, unknown>): void {
  socket.emit("event", socket.rooms.has(TOKEN_PAGES) ? event : withoutCredentials(event));
}
