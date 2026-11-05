import type { WebSocketLike } from "../realtime/adapters";
import { encodeMessage } from "../realtime/ws/ws-protocol";
import { closeReason } from "./close-reason";
import { isSendableCloseCode, type SessionClose, type WireDialect } from "./ws-dialect";

/**
 * What the server holds of one connection's life beyond its frames: the
 * dialect it speaks, whether the server closes it, and the deadline of the
 * credentials it asked for again.
 */
export interface WSSession {
  readonly dialect: WireDialect;
  /** Whether the server has closed it, or begun to */
  readonly closing: boolean;
  /**
   * Close it, once, for why: the dialect says it in its codes.
   * @throws TypeError for an application's code a socket cannot send
   */
  close(why: SessionClose): void;
  /**
   * Ask the client for its credentials again; unless they are taken within
   * `timeoutMs` the connection is closed. 0 sets no deadline.
   * @returns The function that lifts the deadline
   */
  requireAuth(timeoutMs: number): () => void;
  /** The credentials asked for came in and were taken: the deadline is lifted */
  credentialsRenewed(): void;
  /** The socket closed: nothing waits on it any more */
  dispose(): void;
}

/**
 * The life of one connection: it is closed in one place, for a reason the
 * dialect turns into its code and reason, and once — what asks for a close
 * after the first is the same close. The credentials asked for again have a
 * deadline of their own, which closes the connection when they are not
 * renewed in time, and which closing or renewing lifts.
 *
 * @param ws - The connection's socket
 * @param dialect - The protocol it speaks
 * @param onClose - Told the code of the close the server sends, as it sends it
 * @returns The session
 * @example
 * ```ts
 * const session = createSession(ws, V1_DIALECT);
 * session.close({ kind: "heartbeat-timeout" });
 * ```
 */
export function createSession(
  ws: WebSocketLike,
  dialect: WireDialect,
  onClose?: (code: number) => void,
): WSSession {
  let closing = false;
  let deadline: ReturnType<typeof setTimeout> | undefined;

  function lift(): void {
    clearTimeout(deadline);
    deadline = undefined;
  }

  const session: WSSession = {
    dialect,
    get closing() {
      return closing;
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
      const frame = dialect.closeOf(why);
      onClose?.(frame.code);
      ws.close(frame.code, closeReason(frame.reason));
    },
    requireAuth(timeoutMs) {
      if (closing) return () => undefined;
      if (ws.readyState === 1) ws.send(encodeMessage(dialect.reauthRequest(timeoutMs)));
      if (timeoutMs <= 0) return () => undefined;
      lift();
      const timer = setTimeout(() => session.close({ kind: "reauth-timeout" }), timeoutMs);
      deadline = timer;
      return () => {
        if (deadline === timer) lift();
      };
    },
    credentialsRenewed: lift,
    dispose() {
      closing = true;
      lift();
    },
  };
  return session;
}
