import { answerInit } from "../../utils/answer-init";
import { discardBody } from "../discard-body";
import { entryRequestOf } from "../entry-request";
import { peerAddressOf } from "../peer-address";
import { readBodyText } from "../read-body-text";
import type { HTTPAnswer } from "./http-answers";
import type { HTTPExchange } from "./http-entry";

/**
 * A web request of the HTTP transport, as its entry reads it: a connection
 * it opens is opened with the request itself.
 *
 * @param request - The request
 * @param peerAddress - The address it came from; the one a Node adapter recorded unless given
 * @returns The exchange
 * @example
 * ```ts
 * const answer = await entry(webExchange(request, peer));
 * ```
 */
export function webExchange(request: Request, peerAddress: string | undefined): HTTPExchange {
  return {
    ...entryRequestOf(request),
    peerAddress: peerAddress ?? peerAddressOf(request),
    text: (limits) => readBodyText(request, limits),
    discard: () => discardBody(request),
    opening: () => request,
  };
}

/**
 * The transport's answer as a web `Response`: an answer of events streams
 * them as the connection writes them, and a client that leaves cancels it.
 *
 * @param answer - The answer
 * @returns The response
 * @example
 * ```ts
 * return responseOf(await entry(webExchange(request, peer)));
 * ```
 */
export function responseOf(answer: HTTPAnswer): Response {
  const { body } = answer;
  const init = answerInit(answer.status, answer.headers);
  if (body === undefined || typeof body === "string") return new Response(body ?? null, init);
  const events = new ReadableStream<Uint8Array>({
    start(controller) {
      body.attach({
        write: (bytes) => controller.enqueue(bytes),
        end: (last) => {
          if (last !== undefined) controller.enqueue(last);
          controller.close();
        },
      });
    },
    cancel: () => body.leave(),
  });
  return new Response(events, init);
}
