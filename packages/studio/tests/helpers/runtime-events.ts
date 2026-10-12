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
