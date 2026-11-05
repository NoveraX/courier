import { TimeoutError } from "../errors/timeout-error";
import { sendingOf } from "../utils/upload-sending";
import { BodyError, bodyErrorOf } from "./body-error";
import { type EnvelopeRefusal, refusedBody } from "./envelope-result";

/**
 * The refusal of an upload a proxied call was sending on as it arrived,
 * when that upload failing on the client's side — cut short, over a limit,
 * not multipart, too slow — is what failed the call; told once in the log.
 * A time that ran out — a deadline — while the upload was still arriving is
 * the client's upload too slow as well: the upstream was waiting on it.
 *
 * Only a server proxies an upload: a bundler that builds for the browser
 * takes a stand-in that finds none.
 *
 * @param error - What the call failed with
 * @param variables - The call's variables, its upload among them
 * @returns The refusal to answer with, or `undefined` for a call that failed for another reason
 *
 * @example
 * ```ts
 * const unsent = unsentUpload(error, ctx.variables);
 * if (unsent) return errorResponse(unsent.status, unsent.message, unsent.code);
 * ```
 */
export function unsentUpload(error: unknown, variables?: unknown): EnvelopeRefusal | undefined {
  const refused = bodyErrorOf(error) ?? arrivingTooSlowly(error, variables);
  return refused === undefined ? undefined : refusedBody(refused);
}

function arrivingTooSlowly(error: unknown, variables: unknown): BodyError | undefined {
  const sending = sendingOf(variables);
  if (!(error instanceof TimeoutError) || sending === undefined || sending.whole())
    return undefined;
  return new BodyError("BODY_TIMEOUT", "The request body did not arrive within the call's time", {
    cause: error,
  });
}
