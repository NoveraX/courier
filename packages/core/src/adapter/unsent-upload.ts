import { bodyErrorOf } from "./body-error";
import { type EnvelopeRefusal, refusedBody } from "./envelope-result";

/**
 * The refusal of an upload a proxied call was sending on as it arrived,
 * when that upload failing on the client's side — cut short, over a limit,
 * not multipart, too slow — is what failed the call; told once in the log.
 *
 * Only a server proxies an upload: a bundler that builds for the browser
 * takes a stand-in that finds none.
 *
 * @param error - What the call failed with
 * @returns The refusal to answer with, or `undefined` for a call that failed for another reason
 *
 * @example
 * ```ts
 * const unsent = unsentUpload(error);
 * if (unsent) return errorResponse(unsent.status, unsent.message, unsent.code);
 * ```
 */
export function unsentUpload(error: unknown): EnvelopeRefusal | undefined {
  const refused = bodyErrorOf(error);
  return refused === undefined ? undefined : refusedBody(refused);
}
