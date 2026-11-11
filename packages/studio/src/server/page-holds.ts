/**
 * What a page without the project's token is sent while a replay of a log
 * is read for it waits behind the replay, held in the order it was sent,
 * and is written once the replay is: such a page is sent everything in
 * the order a page replayed at once is, a replay before what was sent
 * after it was asked for. A page is held a bounded amount: past the bound,
 * what waits is written at once and each replay it waited behind is read
 * again, so no replay a page is sent is older than what it was sent live.
 */

import type { Socket } from "socket.io";

/** The most messages a page waiting for its replay is held. */
export const HELD_MESSAGES = 4096;

/** The most of them, in bytes, as their JSON counts them, a binary payload by its length. */
export const HELD_BYTES = 16 * 1024 * 1024;

/* What writes a packet to a page's connection as it is: the outlet ruled it. */
type Write = (packet: unknown, opts: unknown) => void;

/* A replay's place among what a page is held: filled with what sends it once it is read. */
interface Place {
  send: (() => void) | undefined;
  filled: boolean;
  stale: boolean;
}

interface Held {
  packet: unknown;
  opts: unknown;
}

interface Outbox {
  waiting: Array<Place | Held>;
  count: number;
  bytes: number;
  writing: boolean;
}

const writers = new WeakMap<Socket, Write>();
const outboxes = new WeakMap<Socket, Outbox>();
const sizes = new WeakMap<object, number>();

/**
 * What writes a page's packets past what it is held: its connection's own
 * write, for the packets the outlet ruled.
 *
 * @param socket - The page's socket, without the token
 * @param write - The connection's write
 * @example
 * ```ts
 * writePast(socket, (packet, opts) => written.call(client, packet, opts));
 * ```
 */
export function writePast(socket: Socket, write: Write): void {
  writers.set(socket, write);
}

/**
 * Let go what a page that left was held.
 *
 * @param socket - The page's socket
 * @example
 * ```ts
 * socket.once("disconnect", () => forgetHeld(socket));
 * ```
 */
export function forgetHeld(socket: Socket): void {
  outboxes.delete(socket);
  writers.delete(socket);
}

/**
 * Hold a packet, ruled, for a page while a replay it waits for is read.
 *
 * @param socket - The page's socket, if one is open
 * @param packet - The packet, as the page is written it
 * @param opts - How it is written
 * @returns `true` once held, to be written after the replay; `false` where the page waits for none
 * @example
 * ```ts
 * if (!holdsBack(socket, shown, opts)) written.call(client, shown, opts);
 * ```
 */
export function holdsBack(socket: Socket | undefined, packet: unknown, opts: unknown): boolean {
  const box = socket && outboxes.get(socket);
  if (!socket || !box || box.writing || !writers.has(socket)) return false;
  box.waiting.push({ packet, opts });
  box.count += 1;
  box.bytes += sizeOf(packet);
  if (box.count > HELD_MESSAGES || box.bytes > HELD_BYTES) spill(socket, box);
  return true;
}

/**
 * Send a page a replay in its place among what it is sent: what is sent
 * it from now on is held behind it until it is read, and written after it.
 * A replay whose page was written what it was held meanwhile is read again.
 *
 * @param socket - The page's socket, without the token
 * @param read - Reads the replay, or gives nothing where it could not be read
 * @param send - Sends the page the replay, once its place comes
 * @returns Settled once the replay is read and in its place
 * @example
 * ```ts
 * await replayInOrder(socket, () => log.shownReplayPayload(), (replay) => emit(event, replay));
 * ```
 */
export async function replayInOrder(
  socket: Socket,
  read: () => Promise<Uint8Array | undefined>,
  send: (replay: Uint8Array) => void,
): Promise<void> {
  const box = outboxes.get(socket) ?? { waiting: [], count: 0, bytes: 0, writing: false };
  outboxes.set(socket, box);
  const place: Place = { send: undefined, filled: false, stale: false };
  box.waiting.push(place);
  let replay: Uint8Array | undefined;
  do {
    place.stale = false;
    replay = await read();
  } while (place.stale);
  const sent = replay;
  place.send = sent && (() => send(sent));
  place.filled = true;
  release(socket);
}

/* Write what is ready of what a page waits for, from the first on: up to a replay not read yet. */
function release(socket: Socket): void {
  const box = outboxes.get(socket);
  if (!box) return;
  box.writing = true;
  try {
    for (let head = box.waiting[0]; head !== undefined; head = box.waiting[0]) {
      if ("filled" in head && !head.filled) return;
      box.waiting.shift();
      if ("filled" in head) head.send?.();
      else {
        box.count -= 1;
        box.bytes -= sizeOf(head.packet);
        writers.get(socket)?.(head.packet, head.opts);
      }
    }
    outboxes.delete(socket);
  } finally {
    box.writing = false;
  }
}

/* Past the bound: write everything held at once, and read again each replay it waited behind. */
function spill(socket: Socket, box: Outbox): void {
  const waiting = box.waiting;
  Object.assign(box, { waiting: [], count: 0, bytes: 0, writing: true });
  try {
    for (const entry of waiting) {
      if (!("filled" in entry)) writers.get(socket)?.(entry.packet, entry.opts);
      else if (entry.filled) entry.send?.();
      else {
        entry.stale = true;
        box.waiting.push(entry);
      }
    }
  } finally {
    box.writing = false;
  }
}

/* A packet's size as its JSON counts it, a binary payload by its length: once for each packet. */
function sizeOf(packet: unknown): number {
  if (typeof packet !== "object" || packet === null) return 0;
  const known = sizes.get(packet);
  if (known !== undefined) return known;
  let binary = 0;
  let text: string | undefined;
  try {
    text = JSON.stringify(Reflect.get(packet, "data"), function (key: string, value: unknown) {
      const own: unknown = Reflect.get(this, key);
      if (!ArrayBuffer.isView(own) && !(own instanceof ArrayBuffer)) return value;
      binary += own.byteLength;
      return null;
    });
  } catch {
    text = undefined;
  }
  const size = (text?.length ?? 0) + binary;
  sizes.set(packet, size);
  return size;
}
