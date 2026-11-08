/**
 * Everything Studio sends a page goes through here, and here alone: an
 * event, an answer to an event the page sent, a message to every page or
 * to the others. A page that presented the project's token is sent each
 * whole. Any other — another process on the machine, a visitor of the
 * public demo — is sent what a call carried only as an export carries it,
 * every value Courier's rules for a name and a text hide replaced, and an
 * event the list of `shown-without-token.ts` does not name not at all.
 *
 * A page without the token is sent nothing past here: {@link guardPageWithoutToken}
 * takes its socket's own `emit` and the answers to what it asks, and
 * {@link guardPageBroadcasts} the namespace's `emit`. The rooms of the
 * pages, a message to the others and one to a page by its id are this
 * module's alone.
 */

import type { Namespace, Socket } from "socket.io";

import { CUT_BY_CALLER, shownToPageWithoutToken, WITHHELD } from "./shown-without-token";

export { answeredWithoutToken, shownToPageWithoutToken, WITHHELD } from "./shown-without-token";

/** The room of the pages that presented the project's token. */
export const TOKEN_PAGES = "pages:token";

/** The room of every other page. */
export const READ_ONLY_PAGES = "pages:read-only";

/* What the sockets of the pages without the token, and the pages' namespace, send with past this
   module's rules. */
const unruled = new WeakMap<Socket, Socket["emit"]>();
const unruledPages = new WeakMap<Namespace, Namespace["emit"]>();

/**
 * Send one page an event: whole when it presented the token, and to any
 * other what {@link shownToPageWithoutToken} leaves of it — or what the
 * caller cut, for an event its caller cuts.
 *
 * @param socket - The page's socket
 * @param event - The event's name
 * @param whole - Its payload, whole
 * @param cut - What a page without the token is sent, for an event its caller cuts
 * @example
 * ```ts
 * toPage(socket, "config:status", status, statusWithoutSecrets(status));
 * ```
 */
export function toPage(socket: Socket, event: string, whole: unknown, cut?: unknown): void {
  if (socket.rooms?.has(TOKEN_PAGES)) {
    socket.emit(event, whole);
    return;
  }
  const shown = shownFor(event, whole, cut);
  if (shown !== WITHHELD) (unruled.get(socket) ?? socket.emit.bind(socket))(event, shown);
}

/**
 * Send every page an event, as {@link toPage} sends one: in one message
 * when a page without the token is sent it as it is.
 *
 * @param pages - The pages' namespace
 * @param event - The event's name
 * @param whole - Its payload, whole
 * @param cut - What a page without the token is sent, for an event its caller cuts
 * @example
 * ```ts
 * toPages(uiNamespace, "storage:cleared", { kinds });
 * ```
 */
export function toPages(pages: Namespace, event: string, whole: unknown, cut?: unknown): void {
  const shown = shownFor(event, whole, cut);
  if (shown === whole) {
    (unruledPages.get(pages) ?? pages.emit.bind(pages))(event, whole);
    return;
  }
  pages.to(TOKEN_PAGES).emit(event, whole);
  if (shown !== WITHHELD) pages.to(READ_ONLY_PAGES).emit(event, shown);
}

/**
 * Send the pages open now an event of the live traffic, as {@link toPages}
 * sends one, a room no page is in sent nothing: Studio would encode the
 * message for it before it looked, and most of the time no page is open.
 * What a page without the token is sent is cut only where one is open.
 *
 * @param pages - The pages' namespace
 * @param event - The event's name
 * @param whole - Its payload, whole
 * @example
 * ```ts
 * toOpenPages(uiNamespace, "events", events);
 * ```
 */
export function toOpenPages(pages: Namespace, event: string, whole: unknown): void {
  if (hasPages(pages, TOKEN_PAGES)) pages.to(TOKEN_PAGES).emit(event, whole);
  if (!hasPages(pages, READ_ONLY_PAGES)) return;
  const shown = shownToPageWithoutToken(event, whole);
  if (shown !== WITHHELD) pages.to(READ_ONLY_PAGES).emit(event, shown);
}

/**
 * Send every page but one an event — the others of the page that changed
 * something — as {@link toPage} sends one.
 *
 * @param socket - The page whose change it tells, which is not sent it
 * @param event - The event's name
 * @param whole - Its payload, whole
 * @example
 * ```ts
 * toOtherPages(socket, "requests:pinned:changed", { id, pinned });
 * ```
 */
export function toOtherPages(socket: Socket, event: string, whole: unknown): void {
  const shown = shownFor(event, whole, undefined);
  if (shown === whole) {
    socket.broadcast.emit(event, whole);
    return;
  }
  socket.to(TOKEN_PAGES).emit(event, whole);
  if (shown !== WITHHELD) socket.to(READ_ONLY_PAGES).emit(event, shown);
}

/**
 * Hold the socket of a page that presented no token to the outlet's
 * rules: every event Studio sends it by its own `emit` is sent as
 * {@link shownToPageWithoutToken} leaves it, and none it does not name.
 *
 * @param socket - The page's socket, just connected without the token
 * @example
 * ```ts
 * if (!presented) guardPageWithoutToken(socket);
 * ```
 */
export function guardPageWithoutToken(socket: Socket): void {
  const send = socket.emit.bind(socket);
  unruled.set(socket, send);
  socket.emit = ((event: string, payload?: unknown) => {
    const shown = shownToPageWithoutToken(event, payload);
    return shown === WITHHELD ? false : send(event, shown);
  }) as Socket["emit"];
}

/**
 * Hold the namespace of the pages to this module's rules: a message to
 * every page is sent whole to those with the token and as
 * {@link shownToPageWithoutToken} leaves it to the others.
 *
 * @param pages - The pages' namespace, just made
 * @example
 * ```ts
 * guardPageBroadcasts(io.of("/ui"));
 * ```
 */
export function guardPageBroadcasts(pages: Namespace): void {
  unruledPages.set(pages, pages.emit.bind(pages));
  pages.emit = ((event: string, payload?: unknown) => {
    toPages(pages, event, payload);
    return true;
  }) as Namespace["emit"];
}

function shownFor(event: string, whole: unknown, cut: unknown): unknown {
  if (CUT_BY_CALLER.has(event)) return cut === undefined ? WITHHELD : cut;
  return shownToPageWithoutToken(event, whole);
}

function hasPages(pages: Namespace, room: string): boolean {
  const rooms: unknown = pages.adapter?.rooms;
  if (!(rooms instanceof Map)) return true;
  const sockets: unknown = rooms.get(room);
  return sockets instanceof Set && sockets.size > 0;
}
