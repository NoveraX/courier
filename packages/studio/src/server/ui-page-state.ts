import type { Socket } from "socket.io";

import type { PageState } from "./storage/page-state";

/**
 * Keep what a page keeps in the project — its settings, whether the welcome
 * was shown, Get started's progress, the Playground's drafts — and send it
 * as it connects, saying whether this page may change it: one opened
 * without the token may not, and keeps its changes to itself. A change one
 * page makes, every other open page follows.
 *
 * @param socket - The page's socket
 * @param pages - The page state in the project's database
 * @param writable - Whether the page has the token
 * @example
 * ```ts
 * bindPageState(socket, stores.pageState, trusted);
 * ```
 */
export function bindPageState(socket: Socket, pages: PageState, writable: boolean): void {
  socket.emit("page:state", { writable, state: pages.read() });
  socket.on("page:state:set", (raw: unknown) => {
    if (typeof raw !== "object" || raw === null) return;
    const key: unknown = Reflect.get(raw, "key");
    const value: unknown = Reflect.get(raw, "value");
    if (pages.write(key, value)) socket.broadcast.emit("page:state:changed", { key, value });
  });
}
