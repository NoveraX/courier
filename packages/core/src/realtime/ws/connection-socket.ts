import type { ScopedLogger } from "../../logger";
import { ConnectionError } from "../errors";
import type { MachineEvent } from "./connection-machine-types";
import type { WSCredentials } from "./ws-credentials";
import type { WSClientSocket, WSConnectionConfig, WSSocketFactory } from "./ws-types";

/** What the connection's socket is made with, and where what it does goes. */
export interface SocketOptions {
  readonly config: WSConnectionConfig;
  readonly log: ScopedLogger;
  readonly factory: WSSocketFactory;
  /** Tell the machine what the socket did */
  readonly dispatch: (event: MachineEvent) => void;
  /** A message came on the socket */
  readonly message: (data: unknown) => void;
}

/** A connection's one socket at a time. */
export interface ConnectionSocket {
  /** Open a socket with the headers its credentials put on the handshake. */
  open(handshake: WSCredentials["handshake"]): void;
  /** Let the socket go, closing it with `code` and `reason`. */
  drop(code: number, reason: string): void;
  /** Hand a frame to the socket. `false` when there is no open socket. */
  send(frame: string): boolean;
  /** What the socket has yet to put on the network, in bytes */
  readonly buffered: number;
}

/**
 * Keep a connection's socket: open one, tell the machine what it does while
 * it is the connection's, and let it go. Everything a socket that is no
 * longer the connection's does is ignored.
 *
 * @param options - The connection's config, and where the socket's events go
 * @returns The connection's socket, none open yet
 */
export function connectionSocket(options: SocketOptions): ConnectionSocket {
  const { config, log, factory, dispatch, message } = options;
  let socket: WSClientSocket | undefined;

  function open(handshake: WSCredentials["handshake"]): void {
    let opened: WSClientSocket;
    try {
      opened = factory(config.url, config.protocols, handshake);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      dispatch({
        type: "socket-failed",
        error: new ConnectionError(`The socket could not be made: ${reason}`),
      });
      return;
    }
    socket = opened;
    let error: unknown;
    let isOpen = false;
    const mine = (): boolean => socket === opened;
    const closed = (code: number, reason: string): void => {
      if (!mine()) return;
      socket = undefined;
      release(opened);
      dispatch({ type: "closed", closure: { code, reason }, announced: false, error });
    };
    opened.onopen = () => {
      isOpen = true;
      if (mine()) dispatch({ type: "socket-open" });
    };
    opened.onmessage = (event) => {
      if (mine()) message(event.data);
    };
    opened.onclose = (event) => closed(event.code, event.reason);
    /* What the error said is told with the close that follows it. Node 22's
       WebSocket reports a refused connection with an error alone, its socket
       left connecting, so one that has not opened is taken as closed — with
       1006, all a failed handshake ever says. */
    opened.onerror = (event) => {
      error = event;
      if (!isOpen) setTimeout(() => closed(1006, ""), 0);
    };
  }

  function drop(code: number, reason: string): void {
    const dropped = socket;
    socket = undefined;
    if (dropped !== undefined) release(dropped, code, reason);
  }

  /*
   * Let a socket go: nothing it does is heard any more. One still opening
   * reports the abort of its handshake as an error, which is the close
   * working — and a `ws` socket with no listener for it would throw it.
   */
  function release(dropped: WSClientSocket, code?: number, reason?: string): void {
    dropped.onopen = dropped.onmessage = dropped.onclose = null;
    dropped.onerror = (event) => log.debug("A socket let go of reported an error", event);
    if (dropped.readyState >= 2) return;
    try {
      dropped.close(code, reason);
    } catch (error) {
      log.warn("A socket could not be closed", error);
    }
  }

  return {
    open,
    drop,
    send(frame) {
      if (socket?.readyState !== 1) return false;
      socket.send(frame);
      return true;
    },
    get buffered() {
      return socket?.bufferedAmount ?? 0;
    },
  };
}
