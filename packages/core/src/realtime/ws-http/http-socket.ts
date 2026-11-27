import { readsAsTheyCome } from "../../utils/answers-whole";
import { HTTP_TRANSPORT_VERSION, type HTTPOpening, PONG_FRAME } from "../ws/http-protocol";
import { deliverOnce } from "./http-delivery";
import { createOutbox } from "./http-outbox";
import { againIfAbsent, endingOf, httpAddressOf, post, waitBeforeAgain } from "./http-post";
import type { HTTPMode, HTTPSocket, HTTPSocketOptions } from "./http-socket-types";

const NOT_ANSWERED = "The server did not answer the connection's opening";

/**
 * A socket whose frames travel over the HTTP transport of a WebSocket
 * handler, on the socket's own path: the connection opens with a stream or
 * a poll that carries the client's first frames, then the server's frames
 * come one answer at a time — a stream held open, or polls — and the
 * client's go in `send` requests: one of each in flight at most. Each of
 * the server's frames is taken once, in order, however often an answer
 * lost on the way has it sent again, and every request acknowledges what
 * was taken. A stream whose first bytes do not come in `probeMs` is held
 * back on the way, so polls carry the frames from then on; with a `fetch`
 * that hands an answer over only once all of it has arrived, as React
 * Native's own does, polls carry them from the start, each answer read
 * whole. The heartbeat's ping is answered by the requests themselves: its
 * pong is not sent.
 *
 * The request that opens the connection is made once: one whose answer
 * brings no `open` event closes the socket with 1006, before it holds any
 * connection, and the connection's backoff decides when to try again, as
 * for a socket that does not open — the platform's error first, where the
 * network did not carry the request, as a WebSocket's handshake that failed
 * reports it. Whatever an answer says before that event is not the
 * server's. A request on the connection that no HTTP transport answered is
 * made again, as one the network did not carry: while a rollout runs, a
 * replica of the earlier release may have had it, and the next, dealt to
 * another, reaches one that answers. A frame larger than the client reads
 * closes the socket with 1009, the server told, as a socket's message too
 * big does: asked for again, it would only come again. A socket the client
 * closes lets go of its stream or poll once the server has the close,
 * `probeMs` at most: let go of first, it would end the connection there as
 * one dropped, with 1006.
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
  /* Every request of the socket goes with the fetch its first one is read for. */
  const send = options.fetch ?? fetch;
  const terms = { url: httpAddressOf(url), fetch: send, init: options.init };
  const life = new AbortController();
  const sending = new AbortController();
  let readyState = 0;
  let mode: HTTPMode = readsAsTheyCome(send) ? options.mode : "poll";
  /* The frames the connection opens with, sent again by an opening made again, until its token comes. */
  let opening: string[] | undefined = [];
  let requested = false;
  let token: string | undefined;
  let taken = 0;
  let untold = 0;
  let ackBytes = Number.POSITIVE_INFINITY;
  const handshake = options.headers === undefined ? {} : { headers: options.headers };
  /* A request on the connection, which takes an answer from no HTTP transport for one to make again. */
  const onConnection = async (body: string, signal: AbortSignal, keepalive?: true) =>
    againIfAbsent(await post(terms, body, signal, keepalive ? { keepalive } : {}));
  const outbox = createOutbox({
    post: (body, keepalive) =>
      keepalive
        ? onConnection(body, new AbortController().signal, true)
        : onConnection(body, sending.signal),
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
    if (readyState !== 1) return;
    if (token === undefined) {
      end(1006, NOT_ANSWERED);
      return;
    }
    if (seq !== undefined && seq <= taken) return;
    if (seq !== undefined) taken = seq;
    socket.onmessage?.({ data });
    if (untold >= ackBytes && mode === "stream") outbox.acknowledge();
  }

  function closed(code: number, reason: string): void {
    if (token === undefined) end(1006, NOT_ANSWERED);
    else end(code, reason);
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
        ? { op: mode, v: HTTP_TRANSPORT_VERSION, cause: options.cause }
        : { op: mode, token, ack: acknowledged() };
      const body = [JSON.stringify(head), ...(first ? (opening ?? []) : [])].join("\n");
      const delivered = await deliverOnce(
        {
          post: first
            ? (signal) => post(terms, body, signal, handshake)
            : (signal) => onConnection(body, signal),
          probeMs: mode === "stream" ? options.probeMs : undefined,
          life: life.signal,
        },
        { received, opened, frame: take, closed },
      );
      if (readyState !== 1) return;
      if (delivered.kind === "ended") {
        const { code, reason } = endingOf(delivered.posted);
        end(code, reason);
      } else if (token === undefined && delivered.kind !== "held") {
        /* As a WebSocket whose handshake failed: what the platform said, then the close. */
        if (delivered.kind === "again" && delivered.error !== undefined)
          socket.onerror?.({ type: "error", error: delivered.error });
        end(1006, NOT_ANSWERED);
      } else if (delivered.kind === "too-large") {
        socket.close(1009, delivered.reason);
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
    get reached() {
      return token !== undefined;
    },
    send(frame) {
      if (readyState !== 1 || frame === PONG_FRAME) return;
      if (requested) outbox.push(frame);
      else opening?.push(frame);
    },
    close(code = 1000, reason = "") {
      if (readyState >= 2) return;
      readyState = 3;
      /* A stream or a poll let go of before the server has the close would end the connection there with 1006. */
      void outbox.close(code, options.probeMs).then(() => life.abort());
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
