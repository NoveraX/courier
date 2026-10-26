import { isHTTPError } from "@noverax/courier";

import { isNetworkReason } from "./network-reason";
import { reasonLine } from "./reason-line";
import { recordedReason } from "./recorded-reason";

/** How many causes an agent is told, and how long each may be. */
const MOST_CAUSES = 4;
const CAUSE_LENGTH = 300;
/* Deeper than any chain a program builds on purpose; a deeper one is cut, as the log cuts it. */
const DEEPEST = 16;
/** What fetch rejects with when a request got no answer: why is its cause. */
export const FETCH_FAILED = "fetch failed";

/**
 * The reasons beneath a failure that an agent is told, outermost first: the
 * network failures in its chain of causes, a line each with its code —
 * `UND_ERR_CONNECT_TIMEOUT: Connect Timeout Error (attempted address: api.example.com:443, timeout: 10000ms)`.
 *
 * A cause of any other origin — a driver's error, an SDK's, the
 * application's own — is left out, for nothing vouches for what its text
 * holds: an address with its query, a header, a body. So is a failure that
 * says only that a request failed — fetch's `fetch failed`, a call's status
 * 0 — when a cause beneath it says why. A call's error status is told as
 * the status alone.
 *
 * @param error - The failure
 * @returns The lines, at most four
 * @example
 * ```ts
 * causeLines(new Error("No user id", { cause: new TypeError("fetch failed", { cause: refused }) }));
 * // ["connect ECONNREFUSED 10.0.0.5:443"]
 * ```
 */
export function causeLines(error: unknown): string[] {
  const lines: string[] = [];
  /* From the root up, so a cause knows whether one beneath it said why. */
  for (const cause of causesOf(error).toReversed()) {
    const line = lineOf(cause, lines.length > 0);
    if (line !== undefined) lines.unshift(line);
  }
  return lines.slice(0, MOST_CAUSES);
}

/* The chain beneath a failure, outermost first; one that loops ends where it repeats. */
function causesOf(error: unknown): Error[] {
  const causes: Error[] = [];
  const seen = new Set<unknown>([error]);
  let current = error instanceof Error ? error.cause : undefined;
  while (current instanceof Error && !seen.has(current) && causes.length < DEEPEST) {
    seen.add(current);
    causes.push(current);
    current = current.cause;
  }
  return causes;
}

function lineOf(cause: Error, explained: boolean): string | undefined {
  if (isHTTPError(cause)) {
    if (cause.status > 0) return `HTTP ${cause.status}`;
    return explained ? undefined : recordedReason(cause, CAUSE_LENGTH);
  }
  if (cause instanceof TypeError && cause.message === FETCH_FAILED) {
    return explained ? undefined : FETCH_FAILED;
  }
  return isNetworkReason(cause) ? reasonLine(cause, CAUSE_LENGTH) : undefined;
}
