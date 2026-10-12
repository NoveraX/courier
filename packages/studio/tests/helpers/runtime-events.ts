import type { Socket } from "socket.io-client";

/**
 * Send events to Studio as a runtime does: every event of one turn in one
 * `events` message, a JSON array as UTF-8 bytes.
 *
 * @param socket - A socket on Studio's `/runtime` namespace
 * @param events - The events, in order
 */
export function sendRuntimeEvents(socket: Socket, events: readonly unknown[]): void {
  socket.emit("events", new TextEncoder().encode(JSON.stringify(events)));
}

/**
 * The events of a replay Studio sent a page: the JSON array its database
 * keeps, in UTF-8.
 *
 * @param payload - The replay as the page's socket handed it over
 * @returns The events
 */
export function replayed(payload: unknown): Array<Record<string, unknown>> {
  if (!(payload instanceof Uint8Array)) throw new Error("Studio sent a replay that is not bytes");
  return JSON.parse(new TextDecoder().decode(payload));
}
