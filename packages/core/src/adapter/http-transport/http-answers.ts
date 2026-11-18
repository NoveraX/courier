import type { HTTPRequestHead } from "../../realtime/ws/http-protocol";
import { answerInit } from "../../utils/answer-init";
import { errorResponse } from "../parse";
import type { HTTPConnection } from "./http-connection";
import type { Answered, Unanswered } from "./http-forwarding";

/* An event stream no proxy holds back or rewrites, and no cache keeps. */
const EVENT_STREAM = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-store, no-transform",
  "X-Accel-Buffering": "no",
};

/**
 * An answer of events: a stream's, or a poll's.
 *
 * @param body - Its events
 * @returns The answer
 * @example
 * ```ts
 * return events(connection.deliver("stream", ack));
 * ```
 */
export function events(body: BodyInit): Response {
  return new Response(body, answerInit(200, EVENT_STREAM));
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
export function gone(): Response {
  return errorResponse(410, "No such connection: open another", "CONNECTION_GONE");
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
): Response {
  const ack = head.ack ?? 0;
  connection.presented();
  switch (head.op) {
    case "stream":
    case "poll":
      return events(connection.deliver(head.op, ack));
    case "send":
      connection.acknowledge(ack);
      if (connection.receive(head.seq ?? 1, frames)) return new Response(null, answerInit(204));
      return errorResponse(409, "Frames before these were not received", "SEQUENCE_GAP");
    case "close":
      connection.peerClose(head.code ?? 1005);
      return new Response(null, answerInit(204));
  }
}

/**
 * An answer as a holder sends it back to the replica that asked: its status and its body, whole.
 *
 * @param response - The holder's answer
 * @returns What travels back
 * @example
 * ```ts
 * return answeredOf(answerHeld(connection, head, frames));
 * ```
 */
export async function answeredOf(response: Response): Promise<Answered> {
  return { status: response.status, body: await response.text() };
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
 * return responseOf(await forwarding.forward(holder, body, 0));
 * ```
 */
export function responseOf(answer: Answered | Unanswered): Response {
  if ("failed" in answer) {
    return answer.failed === "unreachable"
      ? errorResponse(
          504,
          "The replica that holds the connection did not answer",
          "HOLDER_UNREACHABLE",
        )
      : errorResponse(503, "The replicas cannot reach each other now", "FORWARDING_UNAVAILABLE", 1);
  }
  if (answer.status === 200) return events(answer.body);
  if (answer.status === 204) return new Response(null, answerInit(204));
  return new Response(
    answer.body,
    answerInit(answer.status, { "Content-Type": "application/json" }),
  );
}
