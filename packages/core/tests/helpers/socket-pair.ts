import type { WSHandler } from "../../src/adapter/ws-types";
import type { WebSocketLike } from "../../src/realtime/adapters";
import type { WSClientSocket, WSSocketFactory } from "../../src/realtime/ws/ws-types";

/**
 * What the way between a client's WebSocket and its handler does with it:
 * lets it through; refuses its upgrade, as a proxy that takes no WebSocket
 * does; holds the upgrade, never answered; or lets the upgrade through and
 * holds back every frame the server sends on it, the client's still going.
 */
export type SocketWay = "pass" | "refuse" | "hold" | "silent";

/** A factory of WebSockets that reach a handler in-process, and how many it opened. */
export interface SocketsTo {
  readonly factory: WSSocketFactory;
  readonly opened: () => number;
  /** What the way does with each socket opened from now on */
  way: SocketWay;
}

/**
 * A socket factory whose WebSockets reach `handler` in-process through
 * `way`: each opens, fails, or carries a frame on a later turn, as a
 * network's does, and the server's end closes as the client's does.
 *
 * @param handler - The handler each socket reaches
 * @param way - What the way between them does with each socket, until it is changed
 * @returns The factory, how many sockets it opened, and its way
 * @example
 * ```ts
 * const sockets = socketsTo(handler, "refuse");
 * createWSConnection({ url, socketFactory: sockets.factory, fallback: {}, fetch });
 * ```
 */
export function socketsTo(handler: WSHandler, way: SocketWay): SocketsTo {
  let opened = 0;
  const sockets: SocketsTo = {
    way,
    factory: (url) => {
      opened++;
      return pairedSocket(handler, url, sockets.way);
    },
    opened: () => opened,
  };
  return sockets;
}

function pairedSocket(handler: WSHandler, url: string, way: SocketWay): WSClientSocket {
  const listeners = new Map<string, Array<(event: unknown) => void>>();
  let readyState = 0;
  const later = (run: () => void): void => void setTimeout(run, 0);
  const emit = (type: string, event: unknown): void => {
    for (const listener of listeners.get(type) ?? []) listener(event);
  };

  /* The server's end, as a runtime hands an accepted socket to the handler. */
  const server: WebSocketLike = {
    get readyState() {
      return readyState;
    },
    bufferedAmount: 0,
    send(data) {
      if (readyState === 1 && way !== "silent") later(() => client.onmessage?.({ data }));
    },
    close(code = 1005, reason = "") {
      if (readyState >= 2) return;
      readyState = 3;
      later(() => {
        emit("close", { code });
        client.onclose?.({ code, reason });
      });
    },
    addEventListener(type: string, listener: (event: never) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener as (event: unknown) => void]);
    },
  };

  const client: WSClientSocket = {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    get readyState() {
      return readyState;
    },
    bufferedAmount: 0,
    send(data) {
      if (readyState === 1) later(() => emit("message", { data }));
    },
    close(code = 1000, reason = "") {
      if (readyState >= 2) return;
      const open = readyState === 1;
      readyState = 3;
      later(() => {
        if (open) emit("close", { code });
        client.onclose?.(open ? { code, reason } : { code: 1006, reason: "" });
      });
    },
  };

  if (way === "refuse") {
    later(() => {
      readyState = 3;
      client.onerror?.({ type: "error" });
      client.onclose?.({ code: 1006, reason: "" });
    });
  } else if (way !== "hold") {
    later(() => {
      if (readyState !== 0) return;
      readyState = 1;
      handler.handleSocket(server, new Request(url.replace(/^ws/, "http")), "203.0.113.9");
      client.onopen?.({});
    });
  }
  return client;
}
