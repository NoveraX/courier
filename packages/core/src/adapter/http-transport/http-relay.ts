import type { HTTPOperation } from "../../realtime/ws/http-protocol";
import { answerOf, events, type HTTPAnswer } from "./http-answers";
import { createDelivery } from "./http-delivery";
import { RELAYED_EVENT, refusedEvent } from "./http-events";
import type { Answered, Forwarding, Unanswered } from "./http-forwarding";

const encoder = new TextEncoder();

/**
 * Answer a request whose connection another replica holds: sent on to the
 * holder, and its answer given back. A poll may be held there `holdMs`. A
 * stream is answered with a poll of the holder's, so the server's frames
 * leave it only on a poll's answer, and its client asks for its stream
 * again once it ends. That answer begins at once, with a `relayed` event,
 * as the holder's own stream would: however long the holder takes, or a
 * holder that died takes to be given up, its client does not take the
 * stream for one its network holds back. What the holder refused it, or
 * that it did not answer, ends it as a `refused` event, the answer it would
 * have had.
 *
 * @param forwarding - The replicas' forwarding
 * @param holder - The replica the request's token names
 * @param op - What the request asks for
 * @param body - The request's body, sent on as its client sent it
 * @param holdMs - The longest a poll is held
 * @returns The answer for the client
 * @example
 * ```ts
 * return relay(forwarding, holder, head.op, text, terms.holdMs);
 * ```
 */
export function relay(
  forwarding: Forwarding,
  holder: string,
  op: HTTPOperation,
  body: string,
  holdMs: number,
): HTTPAnswer | Promise<HTTPAnswer> {
  if (op === "stream") return relayStream(forwarding, holder, body, holdMs);
  const wait = op === "poll" ? holdMs : 0;
  return forwarding.forward(holder, body, wait).then(answerOf);
}

function relayStream(
  forwarding: Forwarding,
  holder: string,
  body: string,
  holdMs: number,
): HTTPAnswer {
  /* Nothing is told of a client that left: the holder ends its poll, and the answer is let go. */
  const delivery = createDelivery("stream", () => undefined);
  delivery.write(RELAYED_EVENT);
  void forwarding.forward(holder, body, holdMs).then((answer) => {
    delivery.write(restOf(answer));
    delivery.end();
  });
  return events(delivery);
}

/* What follows the `relayed` event: the holder's poll, or the refusal the request would have had. */
function restOf(answer: Answered | Unanswered): Uint8Array {
  if ("failed" in answer || answer.status !== 200) return refusedEvent(answerOf(answer));
  return encoder.encode(answer.body);
}
