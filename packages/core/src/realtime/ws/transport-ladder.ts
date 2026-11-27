import type { HTTPMode } from "../ws-http/http-socket-types";
import type { WSTransport } from "./connection-machine-types";
import type { HTTPFallbackCause } from "./http-protocol";
import type { HTTPRung, LadderOptions, LadderSocket } from "./transport-ladder-types";
import { ABNORMAL_CLOSE, attemptWebSocket } from "./websocket-attempt";
import type { WSClientSocket, WSMessageEventLike, WSSocketFactory } from "./ws-types";

/**
 * Sockets that open a WebSocket first and, where none gets through, carry
 * the connection over HTTP to the same path instead — one transport at a
 * time, so the server admits the connection once. A WebSocket refused or
 * dropped before the server answered on it gives way at once, and one the
 * server has not answered in `afterMs` — its upgrade held, or its frames
 * held back on the way — then: the frames the client sent on it go with
 * the request that opens the connection over HTTP. A WebSocket the server
 * answered on stays, whatever happens to it next. The rung the HTTP
 * transport reached is kept, so the next socket to the path starts there;
 * where no HTTP transport answers, nothing is, and the next tries a
 * WebSocket first again — the replica that answered may be one of an
 * earlier release, which the entry's next request passes by. While
 * HTTP carries the connection, the path is probed for a WebSocket getting
 * through again; once one does, the rung is forgotten and the socket says
 * so: the connection is made anew, on a WebSocket.
 *
 * @param options - The WebSocket, the wait, the memory, and the HTTP transport's loader
 * @returns The socket factory
 * @example
 * ```ts
 * const factory = ladderFactory({ webSocket, afterMs: 3000, memory: rungMemory(true), resume: true, load });
 * const socket = factory("wss://api.example.com/ws");
 * ```
 */
export function ladderFactory(options: LadderOptions): WSSocketFactory {
  return (url, protocols, headers) => ladderSocket(url, protocols, headers, options);
}

function ladderSocket(
  url: string,
  protocols: string[] | undefined,
  headers: Readonly<Record<string, string>> | undefined,
  options: LadderOptions,
): LadderSocket {
  const { memory } = options;
  const kept = memory.get(url);
  let transport: WSTransport = kept ?? "websocket";
  let current: WSClientSocket | undefined;
  let readyState = 0;
  let answered = false;
  /* Whether the server was reached on the transport that carries the connection now. */
  let reached = (): boolean => false;
  /* What the client sent before the server answered, sent again over HTTP should the WebSocket give way. */
  let early: string[] = [];
  /* Ends the watch for a WebSocket getting through again, while HTTP carries the connection. */
  let climbing: (() => void) | undefined;

  function opened(): void {
    if (readyState !== 0) return;
    readyState = 1;
    ladder.onopen?.({});
  }

  function heard(event: WSMessageEventLike): void {
    if (!answered) {
      answered = true;
      early = [];
      if (transport !== "websocket") memory.set(url, transport);
    }
    ladder.onmessage?.(event);
  }

  function ended(code: number, reason: string): void {
    if (readyState === 3) return;
    readyState = 3;
    current = undefined;
    stopClimbing();
    ladder.onclose?.({ code, reason });
  }

  function stopClimbing(): void {
    climbing?.();
    climbing = undefined;
  }

  /* A WebSocket gets through again: the next socket to the path opens one. */
  function climbed(): void {
    climbing = undefined;
    memory.forget(url);
    ladder.onclimb?.();
  }

  function viaWebSocket(): void {
    const attempt = attemptWebSocket(options.webSocket(url, protocols, headers), options.afterMs, {
      opened,
      heard,
      closed: (event) => ended(event.code, event.reason),
      failed: (event) => ladder.onerror?.(event),
      gaveWay: (cause) => {
        if (readyState === 2) ended(ABNORMAL_CLOSE, "");
        else void viaHTTP("stream", cause);
      },
    });
    current = attempt.socket;
    reached = () => attempt.open;
  }

  async function viaHTTP(mode: HTTPMode, cause: HTTPFallbackCause) {
    transport = mode;
    current = undefined;
    reached = () => false;
    let rung: HTTPRung;
    try {
      rung = await options.load();
    } catch {
      return ended(ABNORMAL_CLOSE, "The HTTP transport could not be loaded");
    }
    if (readyState >= 2) return ended(ABNORMAL_CLOSE, "");
    const { fetch, init, afterMs, resume } = options;
    const socket = rung.createHTTPSocket(url, {
      fetch,
      init,
      headers,
      mode,
      probeMs: afterMs,
      cause,
    });
    /* Polls, where its fetch cannot hand over a stream. */
    transport = socket.mode;
    current = socket;
    reached = () => socket.reached;
    socket.onopen = () => {
      opened();
      for (const frame of early.splice(0)) socket.send(frame);
      const open = () => options.webSocket(url, protocols, headers);
      climbing = rung.watchForWebSocket({ open, afterMs, resume, climbed });
    };
    socket.onmessage = heard;
    socket.onmode = (next) => {
      transport = next;
      if (answered) memory.set(url, next);
      ladder.ontransport?.(next);
    };
    socket.onclose = (event) => ended(event.code, event.reason);
    socket.onerror = (event) => ladder.onerror?.(event);
  }

  const ladder: LadderSocket = {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    ontransport: null,
    onclimb: null,
    get readyState() {
      return readyState;
    },
    get bufferedAmount() {
      return current?.bufferedAmount ?? 0;
    },
    get transport() {
      return transport;
    },
    get reached() {
      return reached();
    },
    send(frame) {
      if (readyState !== 1) return;
      /* One not open yet — the HTTP transport loading, or opening — sends it once it is. */
      const socket = current?.readyState === 1 ? current : undefined;
      if (socket === undefined || (!answered && transport === "websocket")) early.push(frame);
      socket?.send(frame);
    },
    close(code, reason) {
      if (readyState >= 2) return;
      readyState = 2;
      stopClimbing();
      if (current === undefined) queueMicrotask(() => ended(code ?? 1000, reason ?? ""));
      else current.close(code, reason);
    },
  };
  if (transport === "websocket") viaWebSocket();
  else void viaHTTP(transport, "remembered");
  return ladder;
}
