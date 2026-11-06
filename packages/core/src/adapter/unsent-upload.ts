import { HTTPError } from "../errors/http-error";
import { TimeoutError } from "../errors/timeout-error";
import { sendingOf } from "../utils/upload-sending";
import { BodyError, bodyErrorOf } from "./body-error";
import { refusedBody } from "./envelope-result";

/**
 * The failure a proxied call is answered with when the upload it was
 * sending on as it arrived failing on the client's side — cut short, over
 * a limit, not multipart, too slow — is what failed it: the refusal the
 * client would have met before the call ran, told once in the log. A time
 * that ran out — a deadline — while the upload was still arriving is the
 * client's upload too slow as well: the upstream was waiting on it.
 *
 * @param error - What the call failed with
 * @param variables - The call's variables, its upload among them
 * @returns The refusal, as the error the call is answered with; `undefined` for a call that failed for another reason
 *
 * @example
 * ```ts
 * executeCall(sources, call, { ...context, unsentUpload }, refuse);
 * ```
 */
export function unsentUpload(error: unknown, variables?: unknown): HTTPError | undefined {
  const refused = bodyErrorOf(error) ?? arrivingTooSlowly(error, variables);
  if (refused === undefined) return undefined;
  const { status, message, code } = refusedBody(refused);
  return new HTTPError({ status, headers: new Headers(), data: { success: false, message, code } });
}

function arrivingTooSlowly(error: unknown, variables: unknown): BodyError | undefined {
  const sending = sendingOf(variables);
  if (!(error instanceof TimeoutError) || sending === undefined || sending.whole())
    return undefined;
  return new BodyError("BODY_TIMEOUT", "The request body did not arrive within the call's time", {
    cause: error,
  });
}
