/**
 * What a Studio page connecting is shown, and how it goes back to the live
 * requests: a page that loaded a saved session is shown it again after a
 * reload, since the session it shows is kept in Studio's database.
 */

import type { Socket } from "socket.io";

import type { RequestLog } from "./request-log";
import type { SessionStore } from "./storage/session-rows";
import type { StudioView } from "./storage/studio-view";

/** What the view reads and changes */
export interface ViewDeps {
  sessions: SessionStore;
  view: StudioView;
  requestLog?: RequestLog | undefined;
}

/**
 * Show a page that connects the saved session the pages show, if any, and
 * take its `view:live`: the pages show the live requests again, and the page
 * is sent them.
 *
 * @param socket - The page's socket
 * @param deps - The sessions, the view, and the live requests
 * @example
 * ```ts
 * uiNamespace.on("connection", (socket) => bindView(socket, { sessions, view, requestLog }));
 * ```
 */
export function bindView(socket: Socket, { sessions, view, requestLog }: ViewDeps): void {
  const shown = view.session();
  if (shown !== undefined) {
    const session = sessions.load(shown);
    /* A session deleted meanwhile, or no longer readable, is shown no more. */
    if (session) socket.emit("view:session", session);
    else view.showLive();
  }
  socket.on("view:live", () => {
    view.showLive();
    if (requestLog) socket.emit("events:replay", requestLog.replayPayload());
  });
}
