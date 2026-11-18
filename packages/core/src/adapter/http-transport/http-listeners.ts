import type { WebSocketLike } from "../../realtime/adapters";

type MessageListener = (event: { data: unknown }) => void;
type CloseListener = (event: { code: number }) => void;

/** What a connection's handler listens to: its frames and its close. */
export interface ConnectionListeners {
  readonly addEventListener: WebSocketLike["addEventListener"];
  /** Hand a frame of the client's to the handler */
  message(data: string): void;
  /** Tell the handler the connection has closed, with its code */
  closed(code: number): void;
}

/**
 * The listeners a handler adds to a connection over HTTP, which the
 * transport tells of its frames and its close. Nothing fails on the
 * server's side of such a connection but its close, so `error` has nothing
 * to tell.
 *
 * @returns The listeners, none yet
 * @example
 * ```ts
 * const listeners = createConnectionListeners();
 * listeners.addEventListener("message", (event) => route(event.data));
 * listeners.message('{"type":"ping"}');
 * ```
 */
export function createConnectionListeners(): ConnectionListeners {
  const onMessage: MessageListener[] = [];
  const onClose: CloseListener[] = [];

  function addEventListener(type: "message", listener: MessageListener): void;
  function addEventListener(type: "close", listener: CloseListener): void;
  function addEventListener(type: "error", listener: (event: unknown) => void): void;
  function addEventListener(
    type: "message" | "close" | "error",
    listener: MessageListener | CloseListener | ((event: unknown) => void),
  ): void {
    // Each type's listener takes that type's event: the cast holds per branch
    if (type === "message") onMessage.push(listener as MessageListener);
    else if (type === "close") onClose.push(listener as CloseListener);
  }

  return {
    addEventListener,
    message(data) {
      for (const listener of onMessage) listener({ data });
    },
    closed(code) {
      for (const listener of onClose) listener({ code });
    },
  };
}
