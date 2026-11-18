import type { HTTPOperation } from "../../realtime/ws/http-protocol";
import { events, responseOf } from "./http-answers";
import { RELAYED_EVENT } from "./http-events";
import type { Answered, Forwarding, Unanswered } from "./http-forwarding";

const encoder = new TextEncoder();

/**
 * Answer a request whose connection another replica holds: sent on to the
 * holder, and its answer given back. A poll may be held there `holdMs`. A
 * stream is answered with a poll of the holder's, so the server's frames
 * leave it only on a poll's answer; the answer begins with a `relayed`
 * event as soon as the holder holds the poll — within a round trip, so the
 * client does not take a stream held back by its network for one held
 * there — and its client asks for its stream again once it ends.
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
  if (op === "stream") return relayStream(forwarding, holder, body, holdMs);
  const wait = op === "poll" ? holdMs : 0;
  return forwarding.forward(holder, body, wait).then(responseOf);
}

function relayStream(
  forwarding: Forwarding,
  holder: string,
  body: string,
  holdMs: number,
): Promise<Response> {
  return new Promise((resolve) => {
    let begun: ReadableStreamDefaultController<Uint8Array> | undefined;
    let left = false;
    const begin = (): void => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          begun = controller;
          controller.enqueue(RELAYED_EVENT);
        },
        cancel() {
          left = true;
        },
      });
      resolve(events(stream));
    };
    forwarding.forward(holder, body, holdMs, begin).then((answer) => {
      if (begun === undefined) resolve(relayedAtOnce(answer));
      else if (!left) {
        if ("status" in answer && answer.status === 200) begun.enqueue(encoder.encode(answer.body));
        begun.close();
      }
    });
  });
}

/* Answered before it was held: with frames, after the event that says whose they are; a refusal
   as it is. */
function relayedAtOnce(answer: Answered | Unanswered): Response {
  if ("failed" in answer || answer.status !== 200) return responseOf(answer);
  return events(new Blob([RELAYED_EVENT, answer.body]));
}
