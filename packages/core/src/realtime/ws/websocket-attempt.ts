import type { HTTPFallbackCause } from "./http-protocol";
import type { WSClientSocket, WSCloseEventLike, WSMessageEventLike } from "./ws-types";

/** A close with no frame, as a socket's that never opened or lost its network reads. */
export const ABNORMAL_CLOSE = 1006;
/* The client's own close of a socket that did not answer as it should. */
const GAVE_UP = 4100;

/** What a ladder is told of the WebSocket it opens first. */
export interface AttemptEvents {
  readonly opened: () => void;
  /** A frame came on it: the first is the server's answer, and it stays from then on */
  readonly heard: (event: WSMessageEventLike) => void;
  /** It closed as a socket its server closes: the connection's close */
  readonly closed: (event: WSCloseEventLike) => void;
  /** Its error, once the server answered on it */
  readonly failed: (event: unknown) => void;
  /** It did not get through, and was let go of: the connection goes on over HTTP */
  readonly gaveWay: (cause: HTTPFallbackCause) => void;
}

/** The WebSocket a ladder opened first. */
export interface WebSocketAttempt {
  readonly socket: WSClientSocket;
  /** Whether it opened */
  readonly open: boolean;
}

/**
 * Watch the WebSocket a ladder opens first, until its server answers on it.
 * One refused, or dropped before the server answered, gives way at once;
 * one whose upgrade is not done in `afterMs` — held on the way — or whose
 * server has not answered on it by then — its frames held back — then. A
 * socket that opened and closed with a code of its server's closes the
 * connection, as one the server answered does: the server was reached.
 *
 * @param socket - The WebSocket, opening
 * @param afterMs - How long its server may take to answer on it
 * @param events - What the ladder is told
 * @returns The attempt
 * @example
 * ```ts
 * const attempt = attemptWebSocket(new WebSocket(url), 3000, { opened, heard, closed, failed, gaveWay });
 * ```
 */
export function attemptWebSocket(
  socket: WSClientSocket,
  afterMs: number,
  events: AttemptEvents,
): WebSocketAttempt {
  let open = false;
  let answered = false;
  const timer = setTimeout(() => giveWay(open ? "silent" : "held"), afterMs);

  function giveWay(cause: HTTPFallbackCause): void {
    clearTimeout(timer);
    letGo(socket);
    events.gaveWay(cause);
  }

  socket.onopen = () => {
    open = true;
    events.opened();
  };
  socket.onmessage = (event) => {
    answered = true;
    clearTimeout(timer);
    events.heard(event);
  };
  socket.onclose = (event) => {
    if (answered || (open && event.code !== ABNORMAL_CLOSE)) {
      clearTimeout(timer);
      events.closed(event);
    } else giveWay(open ? "dropped" : "refused");
  };
  /* A browser's error comes before the close it explains; Node 22's comes alone, for a refusal. */
  socket.onerror = (event) => {
    if (answered) events.failed(event);
    else giveWay(open ? "dropped" : "refused");
  };
  return {
    socket,
    get open() {
      return open;
    },
  };
}

/* A WebSocket given up on: nothing it does is heard any more, and one still opening is aborted. */
function letGo(socket: WSClientSocket): void {
  socket.onopen = socket.onmessage = socket.onclose = null;
  socket.onerror = () => undefined;
  if (socket.readyState >= 2) return;
  try {
    socket.close(GAVE_UP, "Not answered in time");
  } catch {
    /* A socket that cannot be closed is gone already. */
  }
}
