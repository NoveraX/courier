import type { RetryOptions } from "../define/options";
import { ConfigurationError } from "../errors/configuration-error";
import { RETRY_DEFAULTS } from "./retry-defaults";

/* An answer's status, as RFC 9110 numbers them. */
const FIRST_STATUS = 100;
const LAST_STATUS = 599;

/* The longest a timer keeps: past it, setTimeout fires at once, and a deadline would end every call. */
const LONGEST_TIMER = 2 ** 31 - 1;

const isWait = (value: unknown): boolean =>
  typeof value === "number" && value >= 0 && value <= LONGEST_TIMER;
const isFunction = (value: unknown): boolean => typeof value === "function";

/* What each option may be. */
const CHECKS: Readonly<Record<keyof RetryOptions, (value: unknown) => boolean>> = {
  limit: (value) =>
    Number.isInteger(value) && Number(value) >= 0 && Number(value) <= RETRY_DEFAULTS.maxLimit,
  delay: isWait,
  maxDelay: isWait,
  deadline: (value) => isWait(value) && Number(value) > 0,
  backoff: (value) => value === "fixed" || value === "exponential",
  jitter: (value) => value === "full" || value === "none",
  retryOn: (value) => isFunction(value) || (Array.isArray(value) && value.every(isTrigger)),
  mutations: (value) => typeof value === "boolean",
  onRetry: isFunction,
  random: isFunction,
};

/**
 * Refuse a retry policy that cannot work as written as it is made — where
 * `retryMiddleware` is called, and on an endpoint's first call for its
 * `.retry()` — rather than on the failure that would have found out: an
 * option it does not have, a limit past ten, a wait that is no number of
 * milliseconds or longer than a timer keeps, about 24.8 days, or a
 * `retryOn` naming what no failure is. A 0 there once stood for a request
 * that got no answer, and now matches nothing: it is refused with the
 * words that replace it rather than left to stop the retries it was
 * written for.
 *
 * @param options - The policy
 * @throws {ConfigurationError} `RETRY_OPTIONS_INVALID`, naming what is wrong
 * @example
 * ```ts
 * assertRetryOptions({ retryOn: ["network", 503] }); // passes
 * ```
 */
export function assertRetryOptions(options: RetryOptions): void {
  const entries: [string, unknown][] = Object.entries(options);
  for (const [key, value] of entries) {
    if (value === undefined) continue;
    /* Its own keys alone: a "toString" in the options is no option, whatever an object inherits. */
    const check = Object.hasOwn(CHECKS, key) ? CHECKS[key as keyof RetryOptions] : undefined;
    if (check?.(value)) continue;
    throw new ConfigurationError(
      "RETRY_OPTIONS_INVALID",
      check === undefined
        ? `A retry policy has no option "${key}"`
        : key === "retryOn" && Array.isArray(value) && value.includes(0)
          ? `retryOn lists 0: a request that got no answer is "network", one out of time "timeout"`
          : `A retry policy's ${key} cannot be ${String(value)}`,
    );
  }
}

function isTrigger(trigger: unknown): boolean {
  return (
    trigger === "network" ||
    trigger === "timeout" ||
    (Number.isInteger(trigger) && Number(trigger) >= FIRST_STATUS && Number(trigger) <= LAST_STATUS)
  );
}
