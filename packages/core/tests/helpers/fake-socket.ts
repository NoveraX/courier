import type { WebSocketLike } from "../../src/realtime/adapters";
import { decodeMessage, encodeMessage, type WSMessage } from "../../src/realtime/ws/ws-protocol";

/** How the handler closed a socket, and when. */
export interface SocketClosure {
  code: number | undefined;
  reason: string | undefined;
  at: number;
}

/** A socket that records what a handler sends it and how it closes it. */
export interface FakeSocket extends WebSocketLike {
  /** Every frame the handler sent, decoded, in order */
  readonly sent: WSMessage[];
  /** Set once the handler closed it */
  closed: SocketClosure | undefined;
  /** Deliver an event to the handler's listeners, as the runtime would */
  emit(type: "message" | "close" | "error", event?: unknown): void;
  /** Send a frame from the client */
  receive(msg: WSMessage): void;
}

/**
 * A stand-in for an accepted WebSocket: open, with nothing buffered. A close
 * from the handler is recorded and its close event follows on a microtask,
 * as a socket's does once the closing handshake is done.
 *
 * @returns The socket
 * @example
 * ```ts
 * const socket = createFakeSocket();
 * handler.handleSocket(socket, new Request("http://localhost/api/ws"), "203.0.113.7");
 * socket.receive({ type: "auth", payload: { auth: { userId: "u1" } } });
 * ```
 */
export function createFakeSocket(): FakeSocket {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  let readyState = 1;
  const socket: FakeSocket = {
    get readyState() {
      return readyState;
    },
    bufferedAmount: 0,
    sent: [],
    closed: undefined,
    send(data) {
      socket.sent.push(decodeMessage(data));
    },
    close(code, reason) {
      if (socket.closed) return;
      socket.closed = { code, reason, at: Date.now() };
      readyState = 3;
      queueMicrotask(() => socket.emit("close", { code: code ?? 1005 }));
    },
    addEventListener(type: string, handler: (event: never) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), handler as (event: unknown) => void]);
    },
    emit(type, event) {
      for (const handler of listeners.get(type) ?? []) handler(event);
    },
    receive(msg) {
      socket.emit("message", { data: encodeMessage(msg) });
    },
  };
  return socket;
}
