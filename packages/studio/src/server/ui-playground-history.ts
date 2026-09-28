/**
 * The Playground history each Studio page is shown, and keeps: a page that
 * connects is sent the history kept for the project, and each change a page
 * makes replaces it.
 */

import type { Socket } from "socket.io";

import type { PlaygroundHistory } from "./storage/playground-history";

/**
 * Send a page that connects the Playground history, and keep the history
 * it sends back as it changes.
 *
 * @param socket - The page's socket
 * @param history - The history kept for the project
 * @example
 * ```ts
 * uiNamespace.on("connection", (socket) => bindPlaygroundHistory(socket, history));
 * ```
 */
export function bindPlaygroundHistory(socket: Socket, history: PlaygroundHistory): void {
  socket.emit("playground:history", history.entries());
  socket.on("playground:history:save", (entries: unknown) => {
    if (Array.isArray(entries)) history.replace(entries);
  });
}
