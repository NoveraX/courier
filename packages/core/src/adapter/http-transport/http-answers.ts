import { HTTP_REFUSALS, type HTTPRequestHead } from "../../realtime/ws/http-protocol";
import { errorFields } from "../parse";
import type { HTTPConnection } from "./http-connection-types";
import type { Delivery } from "./http-delivery";
import type { Answered, Unanswered } from "./http-forwarding";

/**
 * An answer of the HTTP transport, as any server writes it: a web
 * `Response`, or Node's own response, which no web object is made for.
 */
export interface HTTPAnswer {
  readonly status: number;
  /** Its headers, by their names in lower case */
  readonly headers: Readonly<Record<string, string>>;
  /** Events written as they come, a whole text, or nothing */
  readonly body: Delivery | string | undefined;
}

/* An event stream no proxy holds back or rewrites, and no cache keeps. */
const EVENT_STREAM: Readonly<Record<string, string>> = {
  "content-type": "text/event-stream",
  "cache-control": "no-store, no-transform",
  "x-accel-buffering": "no",
};

const JSON_BODY: Readonly<Record<string, string>> = { "content-type": "application/json" };

/**
 * An answer of events: a stream's or a poll's as the connection writes it,
 * or a whole one another replica gave back.
 *
 * @param body - Its events
 * @returns The answer
 * @example
 * ```ts
 * return events(connection.deliver("stream", ack));
 * ```
 */
export function events(body: Delivery | string): HTTPAnswer {
  return { status: 200, headers: EVENT_STREAM, body };
}

/**
 * An answer with nothing to say: what a `send` and a `close` are answered.
 *
 * @returns The answer, 204
 * @example
 * ```ts
 * return empty();
 * ```
 */
export function empty(): HTTPAnswer {
  return { status: 204, headers: {}, body: undefined };
}

/**
 * A refusal, as the JSON a proxy's client reads: what `errorResponse`
 * answers, for any server.
 *
 * @param status - The status
 * @param message - What the client did wrong, and how to put it right
 * @param code - A stable name for the refusal
 * @param retryAfter - Seconds to wait before trying again, for a refusal that passes
 * @returns The answer
 * @example
 * ```ts
 * return refusal(409, "Frames before these were not received", "SEQUENCE_GAP");
 * ```
 */
export function refusal(
  status: number,
  message: string,
  code?: string,
  retryAfter?: number,
): HTTPAnswer {
  const headers =
    retryAfter === undefined ? JSON_BODY : { ...JSON_BODY, "retry-after": String(retryAfter) };
  return { status, headers, body: JSON.stringify(errorFields(message, code)) };
}

/**
 * What a request with a token no replica holds a connection for is answered: its client opens another.
 *
 * @returns The answer, 410
 * @example
 * ```ts
 * if (connection === undefined) return gone();
 * ```
 */
export function gone(): HTTPAnswer {
  return refusal(410, "No such connection: open another", HTTP_REFUSALS.gone);
}

/**
 * Answer a request with the token of a connection this replica holds: its
 * next answer of events, the frames it sends, or its close. Its client is
 * heard from, whatever it asks.
 *
 * @param connection - The connection the token names
 * @param head - What the request asks for
 * @param frames - The frames it carries
 * @returns The answer
 * @example
 * ```ts
 * return answerHeld(connection, { op: "send", token, seq: 3, ack: 7 }, frames);
 * ```
 */
export function answerHeld(
  connection: HTTPConnection,
  head: HTTPRequestHead,
  frames: readonly string[],
): HTTPAnswer {
  const ack = head.ack ?? 0;
  connection.presented();
  switch (head.op) {
    case "stream":
    case "poll":
      return events(connection.deliver(head.op, ack));
    case "send":
      connection.acknowledge(ack);
      if (connection.receive(head.seq ?? 1, frames)) return empty();
      return refusal(409, "Frames before these were not received", "SEQUENCE_GAP");
    case "close":
      connection.peerClose(head.code ?? 1005);
      return empty();
  }
}

/**
 * An answer as a holder sends it back to the replica that asked: its
 * status and its body, whole — events once the answer has ended.
 *
 * @param answer - The holder's answer
 * @returns What travels back
 * @example
 * ```ts
 * return answeredOf(answerHeld(connection, head, frames));
 * ```
 */
export function answeredOf(answer: HTTPAnswer): Answered | Promise<Answered> {
  const { status, body } = answer;
  if (body === undefined || typeof body === "string") return { status, body: body ?? "" };
  return new Promise((resolve) => {
    const decoder = new TextDecoder();
    const texts: string[] = [];
    body.attach({
      write: (bytes) => texts.push(decoder.decode(bytes, { stream: true })),
      end: (last) => {
        texts.push(decoder.decode(last));
        resolve({ status, body: texts.join("") });
      },
    });
  });
}

/**
 * The answer a client is given for a request its connection's holder
 * answered, or did not: 504 when the holder did not answer in time, which
 * its client takes for the connection's end, and 503 while the replicas
 * cannot reach each other, which it tries again.
 *
 * @param answer - What came back
 * @returns The answer for the client
 * @example
 * ```ts
 * return answerOf(await forwarding.forward(holder, body, 0));
 * ```
 */
export function answerOf(answer: Answered | Unanswered): HTTPAnswer {
  if ("failed" in answer) {
    return answer.failed === "unreachable"
      ? refusal(
          504,
          "The replica that holds the connection did not answer",
          HTTP_REFUSALS.unreachable,
        )
      : refusal(503, "The replicas cannot reach each other now", HTTP_REFUSALS.unavailable, 1);
  }
  if (answer.status === 200) return events(answer.body);
  if (answer.status === 204) return empty();
  return { status: answer.status, headers: JSON_BODY, body: answer.body };
}
