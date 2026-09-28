import { HTTPError } from "../errors";
import type { Context } from "../http-client/types";
import { createLogger } from "../logger";
import { buildResponse } from "./execute-response";

const log = createLogger("Proxy");

/**
 * Status recorded for a proxied call whose client left first. Nobody reads
 * the answer; the number is what an access log shows, as nginx records it.
 */
const CLIENT_CLOSED_REQUEST = 499;

/**
 * Whether the proxy's own caller went away while its call was running.
 *
 * The upstream request follows the incoming request's signal, so when the
 * browser leaves, the upstream call fails with whatever the framework
 * aborted that signal with: a DOMException from Node's adapters, a string
 * from `@hono/node-server`. Reading the signal rather than the error covers
 * them all.
 *
 * @param context - The call's context, carrying the incoming request
 * @returns `true` when the incoming request has been aborted
 */
export function callerLeft(context: Context | undefined): boolean {
  return context?.proxyMethod !== undefined && context.req?.signal.aborted === true;
}

/**
 * Answer a proxied call whose client has gone, and note it without alarm.
 *
 * A cancelled upload or an abandoned query is the browser's decision, not a
 * failure of the server. It was logged as one — at ERROR, with a stack, once
 * per cancelled call — which buried real failures under routine traffic.
 *
 * @param error - What the upstream call failed with once it was stopped
 * @param context - The call's context
 * @param rawData - Whether the caller asked for the raw envelope
 * @returns The answer, which no one is waiting for
 *
 * @example
 * ```ts
 * if (callerLeft(context)) return answerCallerLeft(error, context, rawData);
 * ```
 */
export function answerCallerLeft(
  error: unknown,
  context: Context | undefined,
  rawData: boolean,
): unknown {
  log.debug("The client left before the upstream answered; its request was stopped", error);
  const answer = {
    status: CLIENT_CLOSED_REQUEST,
    headers: new Headers(),
    data: { success: false, message: "Client closed the request" },
  };
  return buildResponse(context, { ...answer, throw: new HTTPError(answer), rawData });
}
