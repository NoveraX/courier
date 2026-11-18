import type { HTTPOperation } from "../../realtime/ws/http-protocol";
import { events, responseOf } from "./http-answers";
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
): Promise<Response> {
  if (op === "stream") return Promise.resolve(relayStream(forwarding, holder, body, holdMs));
  const wait = op === "poll" ? holdMs : 0;
  return forwarding.forward(holder, body, wait).then(responseOf);
}

function relayStream(
  forwarding: Forwarding,
  holder: string,
  body: string,
  holdMs: number,
): Response {
  let left = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(RELAYED_EVENT);
      void forwarding
        .forward(holder, body, holdMs)
        .then(restOf)
        .then((rest) => {
          if (left) return;
          controller.enqueue(rest);
          controller.close();
        });
    },
    cancel() {
      left = true;
    },
  });
  return events(stream);
}

/* What follows the `relayed` event: the holder's poll, or the refusal the request would have had. */
function restOf(answer: Answered | Unanswered): Promise<Uint8Array> | Uint8Array {
  if ("failed" in answer || answer.status !== 200) return refusedEvent(responseOf(answer));
  return encoder.encode(answer.body);
}
