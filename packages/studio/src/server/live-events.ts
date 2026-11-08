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

import { cutText } from "@noverax/courier/internal";
import type { Namespace, Socket } from "socket.io";

import { isPlainObject } from "./is-plain-object";
import { bodyWithoutSecrets, headersWithoutSecrets } from "./session-file/scrub-secrets";
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
    uiNamespace.to(READ_ONLY_PAGES).emit("events", events.map(shownWithoutToken));
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
  socket.emit("events", [socket.rooms.has(TOKEN_PAGES) ? event : shownWithoutToken(event)]);
}

/* An event as a page without the token is sent it: credentials cut as Studio writes them down, and
   the variables, the answer and a stream message's preview as an export carries them. */
function shownWithoutToken(event: Record<string, unknown>): unknown {
  const kept = withoutCredentials(event);
  if (!isPlainObject(kept)) return kept;
  return {
    ...kept,
    ...(kept.variables !== undefined && { variables: bodyWithoutSecrets(kept.variables) }),
    ...(kept.data !== undefined && { data: bodyWithoutSecrets(kept.data) }),
    ...(typeof kept.dataPreview === "string" && { dataPreview: cutText(kept.dataPreview) }),
    ...headerFieldsWithoutSecrets(kept),
  };
}

/* The fields of an event that hold headers, each value its name keeps read as a text. */
function headerFieldsWithoutSecrets(event: Record<string, unknown>): Record<string, unknown> {
  const cut: Record<string, unknown> = {};
  for (const field of ["headers", "requestHeaders", "responseHeaders"]) {
    const headers = event[field];
    if (isPlainObject(headers))
      cut[field] = headersWithoutSecrets(headers as Record<string, string>);
  }
  return cut;
}

function hasPages(uiNamespace: Namespace, room: string): boolean {
  return (uiNamespace.adapter.rooms.get(room)?.size ?? 0) > 0;
}
