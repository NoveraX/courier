/**
 * Every packet socket.io writes a page's socket — by the socket's own emit
 * or its prototype's, by its packet under any name and off any prototype,
 * or by its connection itself — ends in the connection's `_packet`: the
 * page outlet holds it here for a page without the project's token. An
 * event is written as the list of events leaves it, an answer as an answer
 * to what the page asked, a packet encoded already not at all, and one
 * that carries nothing a call carried as it is. What the outlet decided
 * goes as it decided it, and so does a packet of another namespace the
 * same connection carries.
 */

import type { Socket } from "socket.io";

import { isPlainObject } from "./is-plain-object";
import { isDecided, shownPacket } from "./page-broadcasts";
import { answeredWithoutToken, WITHHELD } from "./shown-without-token";

/* socket.io-parser's packet types that carry what a call carried: an event and an answer, each with
   binary or without. */
const EVENT = 2;
const ACK = 3;
const BINARY_EVENT = 5;
const BINARY_ACK = 6;

/* The namespaces each connection holds to the rules: those a page without the token is connected to. */
const held = new WeakMap<object, Set<string>>();

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
  const names = held.get(client) ?? holdConnection(client);
  if (!names) return;
  const { name } = socket.nsp;
  names.add(name);
  socket.once("disconnect", () => names.delete(name));
}

/* Hold a connection's packets, once for all its pages: none is held until a namespace is. */
function holdConnection(client: object): Set<string> | undefined {
  const write: unknown = Reflect.get(client, "_packet");
  if (typeof write !== "function") return undefined;
  const written = write as (packet: unknown, opts?: unknown) => void;
  const names = new Set<string>();
  held.set(client, names);
  Reflect.set(client, "_packet", (packet: unknown, opts?: unknown) => {
    const shown = isDecided() || !isHeld(packet, names) ? packet : packetToPage(packet);
    if (shown !== WITHHELD) written.call(client, shown, opts);
  });
  return names;
}

/* Whether a packet goes to a namespace held: the one it names, or — one encoded already, or one
   naming none — any, while one is. */
function isHeld(packet: unknown, names: ReadonlySet<string>): boolean {
  const nsp: unknown = isPlainObject(packet) ? packet.nsp : undefined;
  return typeof nsp === "string" ? names.has(nsp) : names.size > 0;
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
