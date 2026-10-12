import type { Socket } from "socket.io";

import type { RequestPins } from "./storage/request-pins";

/**
 * Keep the requests pages pin: a page that connects is told which are
 * pinned, after the requests themselves, and a pin one page makes, or
 * takes away, every other open page follows.
 *
 * @param socket - The page's socket
 * @param pins - The pins kept in the project's database
 * @example
 * ```ts
 * socket.emit("events:replay", requestLog.replayPayload());
 * bindRequestPins(socket, stores.pins);
 * ```
 */
export function bindRequestPins(socket: Socket, pins: RequestPins): void {
  socket.emit("requests:pinned", pins.ids());
  socket.on("requests:pin", (raw: unknown) => {
    if (typeof raw !== "object" || raw === null) return;
    const id: unknown = Reflect.get(raw, "id");
    const pinned: unknown = Reflect.get(raw, "pinned");
    if (typeof id !== "string" || typeof pinned !== "boolean") return;
    pins.set(id, pinned);
    socket.broadcast.emit("requests:pinned:changed", { id, pinned });
  });
}
