import type { WebSocketLike } from "../../realtime/adapters";
import { HTTP_TRANSPORT_VERSION, type HTTPRequestHead } from "../../realtime/ws/http-protocol";
import { answerInit } from "../../utils/answer-init";
import { errorResponse } from "../parse";
import { readBodyText } from "../read-body-text";
import { createHTTPConnection, type HTTPConnection } from "./http-connection";
import type { DeliveryKind } from "./http-delivery";
import type { HTTPTerms } from "./http-terms";
import { mintToken, replicaName } from "./http-token";
import { readHTTPRequest } from "./read-http-request";

/** What a handler's connections over HTTP are doing, on this replica. */
export interface HTTPTransportStats {
  /** Connections held over HTTP, admitted or still being admitted */
  readonly connections: number;
  /** Those that deliver on a stream now */
  readonly streaming: number;
  /** Those that hold a poll now */
  readonly polling: number;
}

/** A handler's HTTP transport: its requests answered, its connections held. */
export interface HTTPTransport {
  /** Answer one request of the transport, which the handler's gate let through */
  handle(request: Request): Promise<Response>;
  stats(): HTTPTransportStats;
  /** End the connections still held: the handler has stopped, and has told their clients so */
  destroy(): void;
}

/* An event stream no proxy holds back or rewrites, and no cache keeps. */
const EVENT_STREAM = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-store, no-transform",
  "X-Accel-Buffering": "no",
};

/**
 * The HTTP transport of a WebSocket handler, for clients whose network lets
 * no socket through. The `stream` or `poll` that opens a connection hands
 * the handler a socket — `handleSocket`, so the connection is admitted,
 * limited, heard and closed as a socket is — and its frames; each later
 * request names the connection by its token and does what it asks to it.
 * A token this replica holds no connection for is answered 410, and its
 * client opens another.
 *
 * @param terms - How its connections hold their answers, and the largest body
 * @param handleSocket - The handler's way in for a socket
 * @returns The transport
 * @example
 * ```ts
 * const http = createHTTPTransport(httpTermsOf(config), handleSocket);
 * const response = await http.handle(request);
 * ```
 */
export function createHTTPTransport(
  terms: HTTPTerms,
  handleSocket: (ws: WebSocketLike, request: Request) => unknown,
): HTTPTransport {
  const replica = replicaName();
  const held = new Map<string, HTTPConnection>();

  function open(kind: DeliveryKind, frames: readonly string[], request: Request): Response {
    const token = mintToken(replica);
    const connection = createHTTPConnection(token, terms, () => held.delete(token));
    held.set(token, connection);
    const body = connection.deliver(kind, 0);
    handleSocket(connection, request);
    connection.receive(1, frames);
    return events(body);
  }

  function answer(
    connection: HTTPConnection,
    head: HTTPRequestHead,
    frames: readonly string[],
  ): Response {
    const ack = head.ack ?? 0;
    connection.presented();
    switch (head.op) {
      case "stream":
      case "poll":
        return events(connection.deliver(head.op, ack));
      case "send":
        connection.acknowledge(ack);
        if (connection.receive(head.seq ?? 1, frames)) return noContent();
        return errorResponse(409, "Frames before these were not received", "SEQUENCE_GAP");
      case "close":
        connection.peerClose(head.code ?? 1005);
        return noContent();
    }
  }

  return {
    async handle(request) {
      if (request.method !== "POST") {
        return errorResponse(405, "The HTTP transport takes POST requests", "METHOD_NOT_ALLOWED");
      }
      const body = await readBodyText(request, { maxBytes: terms.maxBodyBytes });
      if (!body.ok) return errorResponse(body.error.status, body.error.message, body.error.code);
      const read = readHTTPRequest(body.text);
      if (read === undefined) {
        return errorResponse(400, "Not a request of the HTTP transport", "MALFORMED_REQUEST");
      }
      const { head, frames } = read;
      if (head.token !== undefined) {
        const connection = held.get(head.token);
        if (connection !== undefined) return answer(connection, head, frames);
        return errorResponse(410, "No such connection: open another", "CONNECTION_GONE");
      }
      if (head.op === "send" || head.op === "close") {
        return errorResponse(
          400,
          "A connection opens with a stream or a poll",
          "MALFORMED_REQUEST",
        );
      }
      if (head.v !== HTTP_TRANSPORT_VERSION) {
        return errorResponse(
          400,
          `This server speaks version ${HTTP_TRANSPORT_VERSION} of the HTTP transport`,
          "TRANSPORT_VERSION",
        );
      }
      return open(head.op, frames, request);
    },
    stats() {
      let streaming = 0;
      let polling = 0;
      for (const connection of held.values()) {
        if (connection.delivering === "stream") streaming++;
        else if (connection.delivering === "poll") polling++;
      }
      return { connections: held.size, streaming, polling };
    },
    destroy() {
      for (const connection of [...held.values()]) connection.end();
    },
  };
}

function events(body: ReadableStream<Uint8Array>): Response {
  return new Response(body, answerInit(200, EVENT_STREAM));
}

function noContent(): Response {
  return new Response(null, answerInit(204));
}
