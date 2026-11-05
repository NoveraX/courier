import type { NetworkError, TimeoutError } from "@noverax/courier";
import { failureCause } from "@noverax/courier/internal";

import { shownReason } from "./shown-reason";

/**
 * Why a call got no answer, as the client recorded it — the system's
 * reason and its code, or that the call's time ran out — told as
 * {@link shownReason} tells any reason.
 *
 * @param error - A call that got no answer, or ran out of time
 * @param limit - How long the text may be
 * @returns The line
 * @example
 * ```ts
 * recordedReason(error, 300); // "connect ECONNREFUSED 10.0.0.5:443", or "TIMEOUT: Request timed out after 60000 ms"
 * ```
 */
export function recordedReason(error: NetworkError | TimeoutError, limit: number): string {
  const cause = failureCause(error);
  return shownReason(cause?.message ?? error.message, { code: cause?.code, limit });
}
