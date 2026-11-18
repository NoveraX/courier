import type { RefusalLog } from "../../logger/refusal-log";
import type { PubSubAdapter, WebSocketLike } from "../../realtime/adapters";
import {
  HTTP_REFUSALS,
  HTTP_TRANSPORT_VERSION,
  type HTTPFallbackCause,
} from "../../realtime/ws/http-protocol";
import type { BodyLimits } from "../read-body";
import type { BodyText } from "../read-body-text";
import { answeredOf, answerHeld, events, gone, type HTTPAnswer, refusal } from "./http-answers";
import { createHTTPConnection } from "./http-connection";
import type { HTTPConnection, HTTPCounts } from "./http-connection-types";
import type { DeliveryKind } from "./http-delivery";
import { type Answered, createForwarding } from "./http-forwarding";
import { relay } from "./http-relay";
import type { HTTPTerms } from "./http-terms";
import { createTokens } from "./http-token";
import { type HTTPRequest, readHTTPRequest } from "./read-http-request";

/** What a handler's connections over HTTP are doing, on this replica. */
export interface HTTPTransportStats {
  /** Connections held over HTTP, admitted or still being admitted */
  readonly connections: number;
  /** Those that deliver on a stream now */
  readonly streaming: number;
  /** Those that hold a poll now */
  readonly polling: number;
  /** Requests sent on to the replica that holds their connection, since the handler was made */
  readonly forwarded: number;
  /** Frames sent again, since: an answer that carried them was lost, or ended before its client took them */
  readonly resent: number;
  /** Streams ended after `streamMs`, since, so their clients asked for the next */
  readonly rotated: number;
  /** Connections opened, since, by why their clients were on HTTP; an opening that says no cause is not counted */
  readonly fallbacks: Readonly<Record<HTTPFallbackCause, number>>;
}

/** A request of the HTTP transport, as the server that read it hands it over. */
export interface TransportRequest {
  readonly method: string;
  /** Its body as text, held to `limits` */
  text(limits: BodyLimits): Promise<BodyText>;
  /** The request a connection it opens is opened with, as a socket is with its upgrade */
  opening(): Request;
  /** The address it came from, where its server knows it */
  readonly peerAddress: string | undefined;
}

/** A handler's HTTP transport: its requests answered, its connections held. */
export interface HTTPTransport {
  /** Answer one request of the transport, which the handler's gate let through */
  answer(request: TransportRequest): Promise<HTTPAnswer>;
  stats(): HTTPTransportStats;
  /** End the connections still held: the handler has stopped, and has told their clients so */
  destroy(): void;
}

/** How the replicas a handler shares its pub/sub adapter with reach the connections each holds. */
export interface HTTPCluster {
  readonly pubsub: PubSubAdapter;
  readonly secret: string | undefined;
  readonly refusals: RefusalLog;
}

/**
 * The HTTP transport of a WebSocket handler, for clients whose network lets
 * no socket through. The `stream` or `poll` that opens a connection hands
 * the handler a socket — `handleSocket`, so the connection is admitted,
 * limited, heard and closed as a socket is — and its frames; each later
 * request names the connection by its token and does what it asks to it.
 * With a pub/sub adapter, a request that reaches a replica other than its
 * connection's holder is sent on to the holder, so replicas need no
 * affinity. A token no replica holds a connection for is answered 410, and
 * its client opens another.
 *
 * @param terms - How its connections hold their answers, and the largest body
 * @param handleSocket - The handler's way in for a socket
 * @param cluster - The adapter the replicas share, the cluster's secret and the log, if any
 * @returns The transport
 * @example
 * ```ts
 * const http = createHTTPTransport(httpTermsOf(config), handleSocket, { pubsub, secret, refusals });
 * const answer = await http.answer(request);
 * ```
 */
export function createHTTPTransport(
  terms: HTTPTerms,
  handleSocket: (ws: WebSocketLike, request: Request, peerAddress?: string) => unknown,
  cluster?: HTTPCluster,
): HTTPTransport {
  const tokens = createTokens(cluster?.secret);
  const held = new Map<string, HTTPConnection>();
  const forwarding = cluster && createForwarding({ ...cluster, replica: tokens.replica, serve });
  const counts: HTTPCounts = { resent: 0, rotated: 0 };
  const fallbacks: Record<HTTPFallbackCause, number> = {
    refused: 0,
    held: 0,
    silent: 0,
    dropped: 0,
    remembered: 0,
  };
  let forwarded = 0;

  async function open(
    kind: DeliveryKind,
    frames: readonly string[],
    request: TransportRequest,
  ): Promise<HTTPAnswer> {
    /* Heard before its client has the token, so no request for it can be sent on unheard. */
    await forwarding?.listen();
    const token = await tokens.mint();
    const connection = createHTTPConnection(token, terms, counts, () => held.delete(token));
    held.set(token, connection);
    const delivery = connection.deliver(kind, 0);
    handleSocket(connection, request.opening(), request.peerAddress);
    connection.receive(1, frames);
    return events(delivery);
  }

  /* A request another replica sent on: a stream is held as a poll, so frames leave here only on
     a poll's answer, and `taken` says it is held. */
  async function serve(text: string, wait: number, taken: () => void): Promise<Answered> {
    const read = readHTTPRequest(text);
    if (read === undefined) return answeredOf(malformed());
    const { head, frames } = read;
    const connection = head.token === undefined ? undefined : held.get(head.token);
    if (connection === undefined) return answeredOf(gone());
    if (head.op === "send" || head.op === "close") {
      return answeredOf(answerHeld(connection, head, frames));
    }
    connection.presented();
    const delivery = connection.deliver("poll", head.ack ?? 0, Math.min(wait, terms.holdMs));
    if (connection.holding) taken();
    return answeredOf(events(delivery));
  }

  /* Answered here when the connection is, sent on to its holder when another replica is. */
  async function answerToken(
    { head, frames }: HTTPRequest,
    token: string,
    text: string,
  ): Promise<HTTPAnswer> {
    const connection = held.get(token);
    if (connection !== undefined) return answerHeld(connection, head, frames);
    if (forwarding === undefined) return gone();
    const holder = await tokens.holderOf(token);
    if (holder === undefined || holder === tokens.replica) return gone();
    forwarded++;
    return relay(forwarding, holder, head.op, text, terms.holdMs);
  }

  return {
    async answer(request) {
      if (request.method !== "POST") {
        return refusal(405, "The HTTP transport takes POST requests", "METHOD_NOT_ALLOWED");
      }
      const body = await request.text({ maxBytes: terms.maxBodyBytes });
      if (!body.ok) return refusal(body.error.status, body.error.message, body.error.code);
      const read = readHTTPRequest(body.text);
      if (read === undefined) return malformed();
      const { head, frames } = read;
      if (head.token !== undefined) return answerToken(read, head.token, body.text);
      if (head.op === "send" || head.op === "close") return malformed();
      if (head.v !== HTTP_TRANSPORT_VERSION) {
        return refusal(
          400,
          `This server speaks version ${HTTP_TRANSPORT_VERSION} of the HTTP transport`,
          HTTP_REFUSALS.version,
        );
      }
      if (head.cause !== undefined) fallbacks[head.cause]++;
      return open(head.op, frames, request);
    },
    stats() {
      let streaming = 0;
      let polling = 0;
      for (const connection of held.values()) {
        if (connection.delivering === "stream") streaming++;
        else if (connection.delivering === "poll") polling++;
      }
      return {
        connections: held.size,
        streaming,
        polling,
        forwarded,
        ...counts,
        fallbacks: { ...fallbacks },
      };
    },
    destroy() {
      forwarding?.destroy();
      for (const connection of [...held.values()]) connection.end();
    },
  };
}

function malformed(): HTTPAnswer {
  return refusal(400, "Not a request of the HTTP transport", HTTP_REFUSALS.malformed);
}
