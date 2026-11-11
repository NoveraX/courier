/**
 * Every packet socket.io writes a page's socket — by the socket's own emit
 * or its prototype's, by its packet under any name and off any prototype,
 * or by its connection itself — ends in the connection's `_packet`: the
 * page outlet holds it here for a page without the project's token. An
 * event is written as the list of events leaves it, an answer as an answer
 * to what the page asked, a packet encoded already not at all, and one
 * that carries nothing a call carried as it is. What the outlet decided
 * goes as it decided it, and so does a packet of another namespace the
 * same connection carries. While a replay is read for the page, what
 * carries a call waits behind it, as `page-holds.ts` holds it.
 */

import type { Socket } from "socket.io";

import { isPlainObject } from "./is-plain-object";
import { isDecided, shownPacket } from "./page-broadcasts";
import { forgetHeld, holdsBack, writePast } from "./page-holds";
import { answeredWithoutToken, WITHHELD } from "./shown-without-token";

/* socket.io-parser's packet types that carry what a call carried: an event and an answer, each with
   binary or without. */
const EVENT = 2;
const ACK = 3;
const BINARY_EVENT = 5;
const BINARY_ACK = 6;

/* What each connection holds to the rules: the pages without the token on it, by their namespace,
   and what writes its packets as they are. */
interface HeldConnection {
  pages: Map<string, Socket>;
  write: (packet: unknown, opts: unknown) => void;
}

const held = new WeakMap<object, HeldConnection>();

/**
 * Hold every packet the connection of a page that presented no token
 * writes to the page's namespace to the outlet's rules, as long as the
 * page is connected.
 *
 * @param socket - The page's socket, just connected without the token
 * @example
 * ```ts
 * guardPagePackets(socket);
 * ```
 */
export function guardPagePackets(socket: Socket): void {
  const client: unknown = Reflect.get(socket, "client");
  if (typeof client !== "object" || client === null) return;
  const connection = held.get(client) ?? holdConnection(client);
  if (!connection) return;
  const { name } = socket.nsp;
  connection.pages.set(name, socket);
  writePast(socket, connection.write);
  socket.once("disconnect", () => {
    if (connection.pages.get(name) === socket) connection.pages.delete(name);
    forgetHeld(socket);
  });
}

/* Hold a connection's packets, once for all its pages: none is held until a namespace is. */
function holdConnection(client: object): HeldConnection | undefined {
  const write: unknown = Reflect.get(client, "_packet");
  if (typeof write !== "function") return undefined;
  const written = write as (packet: unknown, opts?: unknown) => void;
  const connection: HeldConnection = {
    pages: new Map(),
    write: (packet, opts) => written.call(client, packet, opts),
  };
  held.set(client, connection);
  Reflect.set(client, "_packet", (packet: unknown, opts?: unknown) => {
    const ruled = isHeld(packet, connection.pages);
    const shown = isDecided() || !ruled ? packet : packetToPage(packet);
    if (shown === WITHHELD) return;
    if (ruled && carriesCall(shown) && holdsBack(pageOf(shown, connection.pages), shown, opts))
      return;
    written.call(client, shown, opts);
  });
  return connection;
}

/* Whether a packet goes to a namespace held: the one it names, or — one encoded already, or one
   naming none — any, while one is. */
function isHeld(packet: unknown, pages: ReadonlyMap<string, Socket>): boolean {
  const nsp: unknown = isPlainObject(packet) ? packet.nsp : undefined;
  return typeof nsp === "string" ? pages.has(nsp) : pages.size > 0;
}

/* The page a packet is written to, of those held. */
function pageOf(packet: unknown, pages: ReadonlyMap<string, Socket>): Socket | undefined {
  const nsp: unknown = isPlainObject(packet) ? packet.nsp : undefined;
  return typeof nsp === "string" ? pages.get(nsp) : undefined;
}

/* Whether a packet carries what a call carried: an event or an answer. */
function carriesCall(packet: unknown): boolean {
  const type: unknown = isPlainObject(packet) ? packet.type : undefined;
  return type === EVENT || type === ACK || type === BINARY_EVENT || type === BINARY_ACK;
}

/* A packet as a page without the token is written it: an event as the list leaves it, an answer as
   an answer to what it asked, one encoded already, which the rules cannot read, not at all, and one
   that carries nothing a call carried — that it connected, why it could not, that it is to go — as
   it is. */
function packetToPage(packet: unknown): unknown {
  if (!isPlainObject(packet)) return WITHHELD;
  const { type, data } = packet;
  if (type === EVENT || type === BINARY_EVENT) return shownPacket(packet);
  if (type !== ACK && type !== BINARY_ACK) return packet;
  if (!Array.isArray(data)) return WITHHELD;
  const replies: readonly unknown[] = data;
  return { ...packet, data: replies.map((reply) => answeredWithoutToken("", reply)) };
}
