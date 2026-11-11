import type { Socket } from "socket.io";

import { toOtherPages } from "./page-outlet";
import type { RequestPins } from "./storage/request-pins";

/**
 * Keep the requests pages pin: a page that connects is told which are
 * pinned, after the requests themselves, and a pin one page makes, or
 * takes away, every other open page follows. A page's pins are taken from
 * the moment it connects, while its replay is still being cut too.
 *
 * @param socket - The page's socket
 * @param pins - The pins kept in the project's database
 * @param replayed - Settled once the page was sent the requests; none when it was sent none
 * @example
 * ```ts
 * bindRequestPins(socket, stores.pins, replayToPage(socket, "events:replay", requestLog));
 * ```
 */
export function bindRequestPins(socket: Socket, pins: RequestPins, replayed?: Promise<void>): void {
  const tell = () => socket.emit("requests:pinned", pins.ids());
  if (replayed) void replayed.then(tell);
  else tell();
  socket.on("requests:pin", (raw: unknown) => {
    if (typeof raw !== "object" || raw === null) return;
    const id: unknown = Reflect.get(raw, "id");
    const pinned: unknown = Reflect.get(raw, "pinned");
    if (typeof id !== "string" || typeof pinned !== "boolean") return;
    pins.set(id, pinned);
    toOtherPages(socket, "requests:pinned:changed", { id, pinned });
  });
}
