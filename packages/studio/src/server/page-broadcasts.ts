/**
 * Every message socket.io sends more than one page goes through the pages'
 * adapter, whichever operator sent it — the namespace's `emit`, `to`, `in`,
 * `except`, `compress`, `volatile`, `local` and `timeout`, a page's
 * `broadcast`, the socket of a page another server holds: the page outlet
 * holds it here. A page that presented the project's token is sent such a
 * message whole; any other as `shown-without-token.ts` leaves it, and an
 * event the list does not name not at all, nor one that waits for each
 * page's answer.
 */

import type { Namespace, Socket } from "socket.io";

import { isPlainObject } from "./is-plain-object";
import { shownToPageWithoutToken, WITHHELD } from "./shown-without-token";

type Adapter = Namespace["adapter"];
type BroadcastOptions = Parameters<Adapter["broadcast"]>[1];

/* The pages that presented the project's token. */
const tokenPages = new WeakSet<Socket>();

/* Set while the outlet sends what it decided a page without the token may be sent. */
let deciding = false;

/**
 * Count a page among those that presented the project's token: a message
 * to more than one page reaches it whole.
 *
 * @param socket - The page's socket, just connected with the token
 * @example
 * ```ts
 * if (presented) admitTokenPage(socket);
 * ```
 */
export function admitTokenPage(socket: Socket): void {
  tokenPages.add(socket);
}

/**
 * Send what the outlet decided a page without the token may be sent: the
 * adapter sends it as it is, to every page it names, and so does the
 * socket of each such page.
 *
 * @param send - What sends it
 * @returns What `send` returns
 * @example
 * ```ts
 * decided(() => pages.to(READ_ONLY_PAGES).emit(event, shown));
 * ```
 */
export function decided<T>(send: () => T): T {
  deciding = true;
  try {
    return send();
  } finally {
    deciding = false;
  }
}

/**
 * Whether the outlet is sending what it decided, now.
 *
 * @returns `true` within {@link decided}
 * @example
 * ```ts
 * const shown = isDecided() ? packet : packetToPage(packet);
 * ```
 */
export function isDecided(): boolean {
  return deciding;
}

/**
 * Hold the pages' adapter to the outlet's rules: a message reaches each
 * page with the token as it was sent, and each other page as the rules
 * leave it. A message no page is open for is not even encoded.
 *
 * @param pages - The pages' namespace, just made
 * @example
 * ```ts
 * guardPageBroadcasts(io.of("/ui"));
 * ```
 */
export function guardPageBroadcasts(pages: Namespace): void {
  const { adapter } = pages;
  const broadcast = adapter.broadcast.bind(adapter);
  const broadcastWithAck = adapter.broadcastWithAck.bind(adapter);
  adapter.broadcast = (packet: unknown, opts: BroadcastOptions): void => {
    const { withToken, without } = reached(pages, opts);
    if (without.length === 0 || deciding) {
      if (withToken.length + without.length > 0) broadcast(packet, opts);
      return;
    }
    const shown = shownPacket(packet);
    if (shown === packet) {
      broadcast(packet, opts);
      return;
    }
    if (withToken.length > 0) broadcast(packet, leaving(opts, without));
    if (shown !== WITHHELD)
      broadcast(shown, { ...opts, rooms: new Set(without), except: new Set() });
  };
  /* A message that waits for each page's answer reaches no page without the token: Studio sends
     none, and such a page's answer would be counted with the others'. */
  adapter.broadcastWithAck = (
    packet: unknown,
    opts: BroadcastOptions,
    counted: (clients: number) => void,
    ack: (...answer: unknown[]) => void,
  ): void => {
    const { without } = reached(pages, opts);
    broadcastWithAck(packet, without.length === 0 ? opts : leaving(opts, without), counted, ack);
  };
}

/* The pages a message reaches, as the adapter finds them — those of its rooms, or every page, but the
   pages of the rooms it leaves out — with the token and without. */
function reached(pages: Namespace, { rooms, except }: BroadcastOptions) {
  const members = (room: string) => pages.adapter.rooms.get(room) ?? [];
  const left = new Set([...(except ?? [])].flatMap((room) => [...members(room)]));
  const ids =
    rooms.size > 0
      ? new Set([...rooms].flatMap((room) => [...members(room)]))
      : pages.adapter.sids.keys();
  const found = { withToken: [] as string[], without: [] as string[] };
  for (const id of ids) {
    const socket = left.has(id) ? undefined : pages.sockets.get(id);
    if (socket) (tokenPages.has(socket) ? found.withToken : found.without).push(id);
  }
  return found;
}

function leaving(opts: BroadcastOptions, pages: readonly string[]): BroadcastOptions {
  return { ...opts, except: new Set([...(opts.except ?? []), ...pages]) };
}

/**
 * A message as a page without the token is sent it: the packet itself
 * where the rules leave it as it is, and {@link WITHHELD} where they
 * withhold it or where it carries more than the one payload they read.
 *
 * @param packet - An event's packet, as socket.io writes it
 * @returns The packet a page without the token is written, or {@link WITHHELD}
 * @example
 * ```ts
 * const shown = shownPacket({ type: 2, data: ["events", events] });
 * ```
 */
export function shownPacket(packet: unknown): unknown {
  const data: unknown = isPlainObject(packet) ? packet.data : undefined;
  if (!isPlainObject(packet) || !Array.isArray(data)) return WITHHELD;
  const [event, payload, ...more]: readonly unknown[] = data;
  if (typeof event !== "string" || more.length > 0) return WITHHELD;
  const shown = shownToPageWithoutToken(event, payload);
  if (shown === WITHHELD) return WITHHELD;
  return shown === payload ? packet : { ...packet, data: [event, shown] };
}
