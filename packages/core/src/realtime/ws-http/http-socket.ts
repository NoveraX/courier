import { HTTP_TRANSPORT_VERSION, type HTTPOpening, PONG_FRAME } from "../ws/http-protocol";
import type { WSClientSocket } from "../ws/ws-types";
import { deliverOnce } from "./http-delivery";
import { createOutbox } from "./http-outbox";
import { endingOf, type PostTerms, post, waitBeforeAgain } from "./http-post";

/** How the server's frames come: on a stream held open, or on polls. */
export type HTTPMode = "stream" | "poll";

/** What a socket over HTTP is made with. */
export interface HTTPSocketOptions {
  /** The source's `fetch`, else the platform's */
  readonly fetch?: typeof fetch | undefined;
  /** What every request is made with besides its method, headers, body and signal */
  readonly init?: RequestInit | undefined;
  /** Headers of the request that opens the connection: the handshake's, where a script may set them */
  readonly headers?: Readonly<Record<string, string>> | undefined;
  /** How the server's frames come first */
  readonly mode: HTTPMode;
  /** How long a stream's first bytes may take before polls carry the frames instead */
  readonly probeMs: number;
}

/** A WebSocket connection carried over HTTP requests, as the client drives a socket. */
export interface HTTPSocket extends WSClientSocket {
  /** How the server's frames come now */
  readonly mode: HTTPMode;
  /** Told when they come another way from then on: a stream held back, so polls */
  onmode: ((mode: HTTPMode) => void) | null;
  /** Whether it closed because no HTTP transport answers at its path */
  readonly absent: boolean;
}

/**
 * A socket whose frames travel over the HTTP transport of a WebSocket
 * handler, on the socket's own path: the connection opens with a stream or
 * a poll that carries the client's first frames, then the server's frames
 * come one answer at a time — a stream held open, or polls — and the
 * client's go in `send` requests: one of each in flight at most. Each of
 * the server's frames is taken once, in order, however often an answer
 * lost on the way has it sent again, and every request acknowledges what
 * was taken. A stream whose first bytes do not come in `probeMs` is held
 * back on the way, so polls carry the frames from then on. The heartbeat's
 * ping is answered by the requests themselves: its pong is not sent.
 *
 * @param url - The socket's address, `ws:` or `wss:`
 * @param options - How its requests are made, and how its frames come first
 * @returns The socket, opening
 * @example
 * ```ts
 * const socket = createHTTPSocket("wss://api.example.com/ws", { mode: "stream", probeMs: 3000 });
 * socket.onopen = () => socket.send(authFrame);
 * ```
 */
export function createHTTPSocket(url: string, options: HTTPSocketOptions): HTTPSocket {
  const terms: PostTerms = { url: httpAddressOf(url), fetch: options.fetch, init: options.init };
  const life = new AbortController();
  const sending = new AbortController();
  let readyState = 0;
  let mode = options.mode;
  let absent = false;
  /* The frames the connection opens with, sent again by an opening made again, until its token comes. */
  let opening: string[] | undefined = [];
  let requested = false;
  let token: string | undefined;
  let taken = 0;
  let untold = 0;
  let ackBytes = Number.POSITIVE_INFINITY;
  const outbox = createOutbox({
    post: (body, keepalive) =>
      keepalive
        ? post(terms, body, new AbortController().signal, { keepalive })
        : post(terms, body, sending.signal),
    ack: acknowledged,
    ended: end,
  });

  function acknowledged(): number {
    untold = 0;
    return taken;
  }

  function opened(said: HTTPOpening): void {
    if (token !== undefined) return;
    token = said.token;
    ackBytes = said.ackBytes;
    outbox.start(said.token, (opening?.length ?? 0) + 1, said.maxBytes);
    opening = undefined;
  }

  /* Every byte of an answer counts, as every byte of a frame the server keeps does. */
  function received(bytes: number): void {
    untold += bytes;
  }

  function take(data: string, seq: number | undefined): void {
    if (readyState !== 1 || (seq !== undefined && seq <= taken)) return;
    if (seq !== undefined) taken = seq;
    socket.onmessage?.({ data });
    if (untold >= ackBytes && mode === "stream") outbox.acknowledge();
  }

  function end(code: number, reason: string): void {
    if (readyState === 3) return;
    readyState = 3;
    outbox.stop();
    sending.abort();
    life.abort();
    socket.onclose?.({ code, reason });
  }

  async function deliveries(): Promise<void> {
    for (let failures = 0; readyState === 1; ) {
      const first = token === undefined;
      const head = first
        ? { op: mode, v: HTTP_TRANSPORT_VERSION }
        : { op: mode, token, ack: acknowledged() };
      const delivered = await deliverOnce(
        {
          terms,
          body: [JSON.stringify(head), ...(first ? (opening ?? []) : [])].join("\n"),
          headers: first ? options.headers : undefined,
          probeMs: mode === "stream" ? options.probeMs : undefined,
          life: life.signal,
        },
        { received, opened, frame: take, closed: end },
      );
      if (readyState !== 1) return;
      if (delivered.kind === "ended") {
        absent = first && delivered.posted.kind === "absent";
        const { code, reason } = endingOf(delivered.posted);
        end(code, reason);
      } else if (delivered.kind === "again") {
        const ms = waitBeforeAgain(delivered.afterMs, failures++);
        await new Promise((resume) => setTimeout(resume, ms));
      } else {
        failures = 0;
        if (delivered.kind === "held") {
          mode = "poll";
          socket.onmode?.(mode);
        }
      }
    }
  }

  const socket: HTTPSocket = {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    onmode: null,
    get readyState() {
      return readyState;
    },
    get bufferedAmount() {
      return outbox.bytes;
    },
    get mode() {
      return mode;
    },
    get absent() {
      return absent;
    },
    send(frame) {
      if (readyState !== 1 || frame === PONG_FRAME) return;
      if (requested) outbox.push(frame);
      else opening?.push(frame);
    },
    close(code = 1000, reason = "") {
      if (readyState >= 2) return;
      readyState = 3;
      outbox.close(code);
      life.abort();
      queueMicrotask(() => socket.onclose?.({ code, reason }));
    },
  };
  queueMicrotask(() => {
    if (readyState !== 0) return;
    readyState = 1;
    socket.onopen?.({});
    /* What the client sends as it opens goes with the request that opens the connection. */
    queueMicrotask(() => {
      requested = true;
      void deliveries();
    });
  });
  return socket;
}

/* The socket's address as HTTP takes it: the same host, path and query. */
function httpAddressOf(url: string): string {
  const address = new URL(url);
  if (address.protocol === "ws:") address.protocol = "http:";
  else if (address.protocol === "wss:") address.protocol = "https:";
  return address.toString();
}
