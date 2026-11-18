import { encodeMessage } from "./ws-protocol";

/**
 * The HTTP transport of a WebSocket connection, for a client whose network
 * lets no socket through: the same connection, its frames and its limits,
 * carried by `POST` requests to the socket's own path.
 *
 * A request's body is text, one line each: the first, JSON, says what the
 * request asks for and for which connection — its `HTTPRequestHead` — and
 * each line after it is one frame of the client's, as a socket carries it.
 * The answer to a `stream` or a `poll` is an event stream: an `open` event
 * first, then each of the server's frames as an event whose id is its
 * sequence number on the connection — the heartbeat's ping, which needs no
 * resending, has none — and a `close` event when the server closes the
 * connection. A frame is one line of JSON, as `encodeMessage` writes it.
 *
 * Any replica takes any request: one that reached a replica other than
 * the connection's holder is sent on to it, and a stream there is answered
 * with a poll of the holder's, which begins with a `relayed` event.
 */

/** The version of the transport's framing, named by every request that opens a connection. */
export const HTTP_TRANSPORT_VERSION = 1;

/**
 * What a request asks for: a `stream` of the server's frames, held open; a
 * `poll`, answered once there is something to send; `send`, the client's
 * frames, or its acknowledgement alone; `close`, the client's close.
 */
export type HTTPOperation = "stream" | "poll" | "send" | "close";

/** The first line of a request: what it asks for, and for which connection. */
export interface HTTPRequestHead {
  readonly op: HTTPOperation;
  /** The transport's version, on the `stream` or `poll` that opens a connection */
  readonly v?: number | undefined;
  /** The connection's token, from its `open` event; absent on the request that opens it */
  readonly token?: string | undefined;
  /** The sequence number of the last of the server's frames the client has taken, in order */
  readonly ack?: number | undefined;
  /** The client's sequence number of the first frame the request carries, counted from 1 */
  readonly seq?: number | undefined;
  /** On `close`, the code the client closes with */
  readonly code?: number | undefined;
}

/** What the `open` event that begins the answer to a connection's first request says. */
export interface HTTPOpening {
  /** The connection's token, which every later request carries */
  readonly token: string;
  /** How many bytes of frames the client takes before it acknowledges them unasked */
  readonly ackBytes: number;
}

/** The names of the events an answer carries besides the frames. */
export const HTTP_EVENTS = {
  /** First on the connection's first answer: its `HTTPOpening` */
  open: "open",
  /** The server closed the connection: `{ code, reason }`, after its last frame */
  close: "close",
  /**
   * First on the answer to a stream that reached a replica other than the
   * one that holds the connection: what follows is a poll's, which that one
   * answered, and the client asks for its stream again
   */
  relayed: "relayed",
} as const;

/** The heartbeat's ping, which the transport answers for the client while it hears from it. */
export const PING_FRAME: string = encodeMessage({ type: "ping" });

/** The pong that answers it. */
export const PONG_FRAME: string = encodeMessage({ type: "pong" });
