import type { WebSocketLike } from "../realtime/adapters";
import { encodeMessage, type WSMessage } from "../realtime/ws/ws-protocol";
import { closeWithNotice, isSendableCloseCode, type SessionClose } from "./ws-close";

/**
 * What the server holds of one connection's life beyond its frames: whether
 * it was let in, whether the server closes it, and the deadline of the
 * credentials it asked for again.
 */
export interface WSSession {
  /** Whether the server has closed it, or begun to */
  readonly closing: boolean;
  /** Whether it was let in: its client was sent `auth_ok` */
  readonly admitted: boolean;
  /**
   * Let it in: the client is sent `auth_ok` — the server's first frame on
   * the socket — and every close from then on is told by `disconnect`
   */
  admit(ok: WSMessage): void;
  /**
   * Close it, once, for why: the code, the reason and the frame before them
   * are why's to say.
   * @throws TypeError for an application's code a socket cannot send
   */
  close(why: SessionClose): void;
  /**
   * Ask the client for its credentials again; unless they are taken within
   * `timeoutMs` the connection is closed. 0 sets no deadline.
   * @returns The function that lifts the deadline
   */
  requireAuth(timeoutMs: number): () => void;
  /** The credentials sent again in the `auth` frame `id` were taken: the deadline is lifted, and `auth_ok` says so */
  credentialsRenewed(id: string | undefined): void;
  /** The socket closed: nothing waits on it any more */
  dispose(): void;
}

/**
 * The life of one connection: it is let in once, by `auth_ok`, and closed
 * in one place, once — what asks for a close after the first is the same
 * close — the frame that says why sent just before the close itself:
 * `auth_error` while the client has not been let in, `disconnect` once it
 * has. The credentials asked for again have a deadline of their own, which
 * closes the connection when they are not renewed in time, and which
 * closing or renewing lifts.
 *
 * @param ws - The connection's socket
 * @param onClose - Told the code of the close the server sends, as it sends it
 * @returns The session
 * @example
 * ```ts
 * const session = createSession(ws);
 * session.close({ kind: "heartbeat-timeout" });
 * ```
 */
export function createSession(ws: WebSocketLike, onClose?: (code: number) => void): WSSession {
  let closing = false;
  let accepted: WSMessage | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;

  function lift(): void {
    clearTimeout(deadline);
    deadline = undefined;
  }

  /* What does not reach a socket that is going away is said by its close all the same. */
  function tell(frame: WSMessage): void {
    if (ws.readyState !== 1) return;
    try {
      ws.send(encodeMessage(frame));
    } catch {
      /* The close follows. */
    }
  }

  const session: WSSession = {
    get closing() {
      return closing;
    },
    get admitted() {
      return accepted !== undefined;
    },
    admit(ok) {
      if (closing || accepted) return;
      accepted = ok;
      tell(ok);
    },
    close(why) {
      if (why.kind === "application" && !isSendableCloseCode(why.code)) {
        throw new TypeError(
          `${why.code} is no code to close a connection with: one of 1000-1014 but 1004-1006, or of 3000-4999`,
        );
      }
      if (closing) return;
      closing = true;
      lift();
      const { code } = closeWithNotice(ws, why, accepted !== undefined);
      onClose?.(code);
    },
    requireAuth(timeoutMs) {
      if (closing) return () => undefined;
      tell({ type: "reauth_required", timeoutMs });
      if (timeoutMs <= 0) return () => undefined;
      lift();
      const timer = setTimeout(() => session.close({ kind: "reauth-timeout" }), timeoutMs);
      deadline = timer;
      return () => {
        if (deadline === timer) lift();
      };
    },
    credentialsRenewed(id) {
      lift();
      if (accepted && !closing) tell({ ...accepted, id });
    },
    dispose() {
      closing = true;
      lift();
    },
  };
  return session;
}
