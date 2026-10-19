/**
 * What a Studio page connecting is shown, and how it goes back to the live
 * requests: a page that loaded a saved session is shown it again after a
 * reload, since the session it shows is kept in Studio's database.
 */

import type { Socket } from "socket.io";

import type { RequestLog } from "./request-log";
import type { SavedSession } from "./session-types";
import type { SessionStore } from "./storage/session-rows";
import type { StudioView } from "./storage/studio-view";

/** What the view reads and changes */
export interface ViewDeps {
  sessions: SessionStore;
  view: StudioView;
  requestLog?: RequestLog | undefined;
}

/**
 * The saved session the pages show, read for a page that connects. A
 * session deleted meanwhile, or no longer readable, is shown no more.
 *
 * @param deps - The sessions and the view
 * @returns The session, or `undefined` while the pages show the live requests
 * @example
 * ```ts
 * const shown = shownSession({ sessions, view });
 * if (!shown) socket.emit("events:replay", requestLog.replayPayload());
 * ```
 */
export function shownSession({
  sessions,
  view,
}: Pick<ViewDeps, "sessions" | "view">): SavedSession | undefined {
  const id = view.session();
  if (id === undefined) return undefined;
  const session = sessions.load(id);
  if (session) return session;
  view.showLive();
  return undefined;
}

/**
 * Show a page that connects the saved session the pages show, if any — in
 * place of the live requests, which it is not sent then — and take its
 * `view:live`: the pages show the live requests again, and the page is
 * sent them.
 *
 * @param socket - The page's socket
 * @param deps - The view, and the live requests
 * @param shown - The session the pages show, from {@link shownSession}
 * @example
 * ```ts
 * uiNamespace.on("connection", (socket) =>
 *   bindView(socket, { view, requestLog }, shownSession({ sessions, view })),
 * );
 * ```
 */
export function bindView(
  socket: Socket,
  { view, requestLog }: Pick<ViewDeps, "view" | "requestLog">,
  shown: SavedSession | undefined,
): void {
  if (shown) socket.emit("view:session", shown);
  socket.on("view:live", () => {
    view.showLive();
    if (requestLog) socket.emit("events:replay", requestLog.replayPayload());
  });
}
