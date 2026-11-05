import type { RetryOptions } from "../define/options";
import { ConfigurationError } from "../errors/configuration-error";

/* An answer's status, as RFC 9110 numbers them. */
const FIRST_STATUS = 100;
const LAST_STATUS = 599;

/**
 * Refuse a retry policy that cannot work as written, where it is written
 * rather than on the call that would have found out.
 *
 * `retryOn` names answers by their status and the failures that had none by
 * a word: `"network"`, `"timeout"`. A 0 there is what once stood for both,
 * and now matches nothing, so it is refused with what replaces it rather
 * than left to stop the retries it was written for.
 *
 * @param options - The policy
 * @throws {ConfigurationError} `RETRY_OPTIONS_INVALID`, naming what is wrong
 * @example
 * ```ts
 * assertRetryOptions({ retryOn: ["network", 503] }); // passes
 * ```
 */
export function assertRetryOptions(options: RetryOptions): void {
  const { retryOn } = options;
  if (retryOn === undefined || typeof retryOn === "function") return;
  for (const trigger of retryOn) {
    if (trigger === "network" || trigger === "timeout") continue;
    if (Number.isInteger(trigger) && trigger >= FIRST_STATUS && trigger <= LAST_STATUS) continue;
    throw new ConfigurationError(
      "RETRY_OPTIONS_INVALID",
      trigger === 0
        ? `retryOn lists 0: a request that got no answer is "network", one out of time "timeout"`
        : `retryOn lists ${trigger}: not "network", "timeout" or a status`,
    );
  }
}
