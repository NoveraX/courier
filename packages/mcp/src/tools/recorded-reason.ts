import type { HTTPError } from "@noverax/courier";

import { isRecord } from "../is-record";
import { errorCode } from "./error-code";
import { shownReason } from "./shown-reason";

/**
 * Why a call got no answer, as the client recorded it in its error's data —
 * the system's reason and its code, or that the call's time ran out — told
 * as {@link shownReason} tells any reason.
 *
 * @param error - A call's failure with status 0
 * @param limit - How long the text may be
 * @returns The line
 * @example
 * ```ts
 * recordedReason(error, 300); // "connect ECONNREFUSED 10.0.0.5:443", or "TIMEOUT: Request timed out after 60000 ms"
 * ```
 */
export function recordedReason(error: HTTPError, limit: number): string {
  const { data } = error;
  const message = isRecord(data) && typeof data.message === "string" ? data.message : error.message;
  return shownReason(message, { code: errorCode(data), limit });
}
