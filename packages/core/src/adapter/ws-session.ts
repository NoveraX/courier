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
  /** The code the server closed it with, once it has */
  readonly closedWith: number | undefined;
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
   * `timeoutMs` the connection is closed. The deadline replaces the one an
   * earlier request set, and 0 sets none: it lifts the earlier one. Asked
   * before the client is let in, they are asked for once it is.
   * @returns The function that lifts the deadline
   */
  requireAuth(timeoutMs: number): () => void;
  /** The deadline in force for the credentials asked for again: the one an `auth` frame received now answers */
  readonly deadline: ReauthDeadline | undefined;
  /**
   * The credentials sent again in the `auth` frame `id` were taken, and
   * `auth_ok` says so. They lift `answered`, the deadline in force when the
   * frame came, unless a later request replaced it: that one stands, and the
   * client is asked again, with the time it has left.
   */
  credentialsRenewed(id: string | undefined, answered: ReauthDeadline | undefined): void;
  /** The socket closed: nothing waits on it any more */
  dispose(): void;
}

/** The deadline the credentials asked for again are to be taken by. */
export interface ReauthDeadline {
  /** When it closes the connection, on the clock of `performance.now()` */
  readonly endsAt: number;
}

/** A deadline set, with the timer that closes the connection at it. */
interface Deadline extends ReauthDeadline {
  readonly timer: ReturnType<typeof setTimeout>;
}

/** Credentials asked for again before the client was let in, and what lifts their deadline once asked. */
interface EarlyRequest {
  readonly timeoutMs: number;
  lift?: (() => void) | undefined;
}

/**
 * The life of one connection: it is let in once, by `auth_ok`, and closed
 * in one place, once — what asks for a close after the first is the same
 * close — the frame that says why sent just before the close itself:
 * `auth_error` while the client has not been let in, `disconnect` once it
 * has. The credentials asked for again have a deadline of their own, which
 * closes the connection when they are not renewed in time, and which
 * closing lifts, or renewing them with credentials sent once it was set;
 * asked for before the client is let in, they are asked for just after
 * `auth_ok`, the latest request's deadline.
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
  let closedWith: number | undefined;
  let accepted: WSMessage | undefined;
  let deadline: Deadline | undefined;
  let asked: EarlyRequest | undefined;

  function lift(): void {
    clearTimeout(deadline?.timer);
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
    get closedWith() {
      return closedWith;
    },
    get admitted() {
      return accepted !== undefined;
    },
    get deadline() {
      return deadline;
    },
    admit(ok) {
      if (closing || accepted) return;
      accepted = ok;
      tell(ok);
      const request = asked;
      asked = undefined;
      if (request) request.lift = session.requireAuth(request.timeoutMs);
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
      closedWith = code;
      onClose?.(code);
    },
    requireAuth(timeoutMs) {
      if (closing) return () => undefined;
      if (accepted === undefined) {
        const request: EarlyRequest = { timeoutMs };
        asked = request;
        return () => {
          if (asked === request) asked = undefined;
          request.lift?.();
        };
      }
      tell({ type: "reauth_required", timeoutMs });
      lift();
      if (timeoutMs <= 0) return () => undefined;
      const set: Deadline = {
        endsAt: performance.now() + timeoutMs,
        timer: setTimeout(() => session.close({ kind: "reauth-timeout" }), timeoutMs),
      };
      deadline = set;
      return () => {
        if (deadline === set) lift();
      };
    },
    credentialsRenewed(id, answered) {
      if (closing || accepted === undefined) return;
      tell({ ...accepted, id });
      if (deadline === undefined) return;
      if (deadline === answered) {
        lift();
        return;
      }
      /* Asked for after the frame came: a client renewing them of itself took the request for one
         the renewal it had sent answers, and is asked again. */
      const left = Math.max(1, Math.ceil(deadline.endsAt - performance.now()));
      tell({ type: "reauth_required", timeoutMs: left });
    },
    dispose() {
      closing = true;
      lift();
    },
  };
  return session;
}
