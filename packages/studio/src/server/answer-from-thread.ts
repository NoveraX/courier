import type { WorkedResponse } from "./request-work";
import { requestWork } from "./request-work";
import { sendRouteFailure } from "./route-failure";
import type { JsonResponse } from "./route-types";

/**
 * Answer a request with what work in a thread of its own returns: the work
 * is told to stop once its caller goes away, and counts as the request's
 * until it settles, so a public demo frees the request's place only then.
 * A failure is answered as the error says — refused, over its budget,
 * Studio busy — and a caller that went away is answered nothing.
 *
 * @param res - The answer
 * @param failure - What a failure the error does not describe is called
 * @param run - Starts the work, stopping it when the signal aborts
 * @returns Once the request is answered
 * @example
 * ```ts
 * await answerFromThread(res, "Failed to diff specs", (signal) =>
 *   diffInThread(oldSpec, newSpec, { trusted: false, signal }),
 * );
 * ```
 */
export async function answerFromThread<TResult>(
  res: JsonResponse & WorkedResponse,
  failure: string,
  run: (signal: AbortSignal) => Promise<TResult>,
): Promise<void> {
  const work = requestWork(res);
  try {
    res.json(await work.hold(run(work.signal)));
  } catch (err) {
    if (!work.signal.aborted) sendRouteFailure(res, err, failure);
  }
}
