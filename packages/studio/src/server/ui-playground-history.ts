/**
 * The Playground history each Studio page is shown, and keeps: a page that
 * connects is sent the history kept for the project, and each change a page
 * with the token makes replaces it.
 */

import type { Socket } from "socket.io";

import type { PlaygroundHistory } from "./storage/playground-history";

/** Who the page is: whether it presented the token, and whether Studio serves a public demo. */
export interface HistoryPage {
  trusted: boolean;
  demo: boolean;
}

/**
 * Send a page that connects the Playground history, and keep the history
 * it sends back as it changes. A page without the token is shown the
 * project's history and changes nothing — except in a public demo, whose
 * visitors each keep their own in their page, unseen by the others.
 *
 * @param socket - The page's socket
 * @param history - The history kept for the project
 * @param page - Whether the page presented the token, and whether Studio serves a demo
 * @example
 * ```ts
 * uiNamespace.on("connection", (socket) => {
 *   const trusted = guardUiWrites(socket, token);
 *   bindPlaygroundHistory(socket, history, { trusted, demo: false });
 * });
 * ```
 */
export function bindPlaygroundHistory(
  socket: Socket,
  history: PlaygroundHistory,
  { trusted, demo }: HistoryPage,
): void {
  socket.emit("playground:history", trusted || !demo ? history.entries() : []);
  if (!trusted) return;
  socket.on("playground:history:save", (entries: unknown) => {
    if (Array.isArray(entries)) history.replace(entries);
  });
}
