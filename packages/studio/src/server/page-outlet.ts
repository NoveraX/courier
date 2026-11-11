/**
 * Everything Studio sends a page goes through here, and here alone: an
 * event, an answer to an event the page sent, a message to every page or
 * to the others. A page that presented the project's token is sent each
 * whole. Any other — another process on the machine, a visitor of the
 * public demo — is sent what a call carried only as an export carries it,
 * every value Courier's rules for a name and a text hide replaced, and an
 * event the list of `shown-without-token.ts` does not name not at all.
 *
 * A page without the token is sent nothing past here, by construction:
 * {@link guardPageWithoutToken} takes its socket's own `emit` and the
 * answers to what it asks, `page-packets.ts` the packets its connection
 * writes, which every emit and packet of the socket ends in, and
 * `page-broadcasts.ts` the pages' adapter, which every operator of
 * socket.io sends more than one page a message through. Which pages
 * presented the token, and the pages' rooms, are this module's alone.
 */

import type { Namespace, Socket } from "socket.io";

import { isPlainObject } from "./is-plain-object";
import { admitTokenPage, decided } from "./page-broadcasts";
import { guardPagePackets } from "./page-packets";
import {
  answeredWithoutToken,
  CUT_BY_CALLER,
  shownToPageWithoutToken,
  WITHHELD,
} from "./shown-without-token";

export { guardPageBroadcasts } from "./page-broadcasts";
export { answeredWithoutToken, shownToPageWithoutToken, WITHHELD } from "./shown-without-token";

/** The room of the pages that presented the project's token. */
export const TOKEN_PAGES = "pages:token";

/** The room of every other page. */
export const READ_ONLY_PAGES = "pages:read-only";

/* What the sockets of the pages without the token send with past this module's rules. */
const unruled = new WeakMap<Socket, Socket["emit"]>();

/** A log a page is replayed as it connects: whole, and as its log cut it for a page without the token. */
export interface ReplayedLog {
  replayPayload(): Uint8Array;
  shownReplayPayload(): Uint8Array;
}

/** The replays of the logs. */
export type ReplayEvent = "events:replay" | "mock:events:replay";

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
  if (shown !== WITHHELD)
    decided(() => (unruled.get(socket) ?? socket.emit.bind(socket))(event, shown));
}

/**
 * Send one page a log's replay: whole when it presented the token, and to
 * any other the replay its log cut as it kept each event — a copy, nothing
 * read or cut again as the page connects, however much was logged since.
 *
 * @param socket - The page's socket
 * @param event - The replay's name
 * @param log - The log
 * @example
 * ```ts
 * replayToPage(socket, "mock:events:replay", mockLog);
 * ```
 */
export function replayToPage(socket: Socket, event: ReplayEvent, log: ReplayedLog): void {
  if (socket.rooms?.has(TOKEN_PAGES)) socket.emit(event, log.replayPayload());
  else {
    const shown = log.shownReplayPayload();
    decided(() => (unruled.get(socket) ?? socket.emit.bind(socket))(event, shown));
  }
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
    decided(() => pages.emit(event, whole));
    return;
  }
  pages.to(TOKEN_PAGES).emit(event, whole);
  if (shown !== WITHHELD) decided(() => pages.to(READ_ONLY_PAGES).emit(event, shown));
}

/**
 * Send every page a log's replay, as {@link replayToPage} sends one: each
 * of its two forms made only where a page is open to be sent it.
 *
 * @param pages - The pages' namespace
 * @param event - The replay's name
 * @param log - The log
 * @example
 * ```ts
 * replayToPages(uiNamespace, "events:replay", requestLog);
 * ```
 */
export function replayToPages(pages: Namespace, event: ReplayEvent, log: ReplayedLog): void {
  if (hasPages(pages, TOKEN_PAGES)) pages.to(TOKEN_PAGES).emit(event, log.replayPayload());
  if (hasPages(pages, READ_ONLY_PAGES)) {
    decided(() => pages.to(READ_ONLY_PAGES).emit(event, log.shownReplayPayload()));
  }
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
  if (shown !== WITHHELD) decided(() => pages.to(READ_ONLY_PAGES).emit(event, shown));
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
    decided(() => socket.broadcast.emit(event, whole));
    return;
  }
  socket.to(TOKEN_PAGES).emit(event, whole);
  if (shown !== WITHHELD) decided(() => socket.to(READ_ONLY_PAGES).emit(event, shown));
}

/**
 * Take a page that just connected into the outlet: one that presented the
 * project's token is sent everything whole, and any other is held to the
 * outlet's rules, by its own socket and by every message to more than one
 * page.
 *
 * @param socket - The page's socket, just connected
 * @param presented - Whether it presented the token
 * @example
 * ```ts
 * admitPage(socket, token.matches(socket.handshake.auth.token));
 * ```
 */
export function admitPage(socket: Socket, presented: boolean): void {
  if (presented) {
    admitTokenPage(socket);
    void socket.join(TOKEN_PAGES);
    return;
  }
  void socket.join(READ_ONLY_PAGES);
  guardPageWithoutToken(socket);
}

/**
 * Hold the socket of a page that presented no token to the outlet's
 * rules: every event Studio sends it by its own `emit` — by `send`,
 * `volatile`, `compress`, `timeout` and `emitWithAck` too, which go through
 * it — is sent as {@link shownToPageWithoutToken} leaves it, and none it
 * does not name, nor one with more than the one payload the rules read.
 * So is every packet its connection writes it past that `emit` — by the
 * emit of its prototype, by its `packet` under any name and off any
 * prototype, by the connection itself — as `page-packets.ts` holds them;
 * an answer written so is cut as an answer is.
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
  socket.emit = ((event: string, ...args: unknown[]) => {
    const last = args.at(-1);
    const answer = typeof last === "function" ? (last as Answer) : undefined;
    const payloads = answer ? args.slice(0, -1) : args;
    const shown = payloads.length > 1 ? WITHHELD : shownToPageWithoutToken(event, payloads[0]);
    if (shown === WITHHELD) return withheld(socket, answer);
    const rest = [...(payloads.length === 0 ? [] : [shown]), ...(answer ? [answer] : [])];
    return decided(() => send(event, ...rest));
  }) as Socket["emit"];
  guardPagePackets(socket);
}

/**
 * The answer a page without the token is given to what it asked, as
 * {@link answeredWithoutToken} leaves it, written as this module decided.
 *
 * @param event - The event the page sent
 * @param ack - What answers it
 * @returns What answers it in its place
 * @example
 * ```ts
 * Reflect.set(packet, packet.length - 1, answerToPage(event, ack));
 * ```
 */
export function answerToPage(
  event: string,
  ack: (reply: unknown) => void,
): (reply: unknown) => void {
  return (reply) => decided(() => ack(answeredWithoutToken(event, reply)));
}

/* What an emit that waits for the page's answer is called back with. */
type Answer = (...reply: unknown[]) => void;

/* An event a page without the token is not sent: one that waits for its answer is told, once its
   timeout passes, that none came, as from a page that never answers, and what `volatile`,
   `compress` or `timeout` set for it does not pass to the next — socket.io keeps both in the
   socket's flags, which its own emit clears as it sends. */
function withheld(socket: Socket, answer: Answer | undefined): false {
  const flags: unknown = Reflect.get(socket, "flags");
  Reflect.set(socket, "flags", {});
  const timeout = isPlainObject(flags) ? flags.timeout : undefined;
  if (answer && typeof timeout === "number") {
    setTimeout(() => answer(new Error("operation has timed out")), timeout);
  }
  return false;
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
