import { RETRY_DEFAULTS } from "./retry-defaults";
import type { RetryFailure } from "./types";

/** The retries the calls of one API may still make, shared between them. */
export interface RetryBudget {
  /**
   * Spend what a retry after this failure costs.
   *
   * @param failure - Why the attempt failed
   * @returns What was spent, or `undefined` when too little is left: no retry
   */
  spend(failure: RetryFailure): number | undefined;
  /**
   * A call was answered: its last retry's cost comes back, or a little for one that needed none.
   *
   * @param spent - What its last retry spent, if it made one
   */
  answered(spent: number | undefined): void;
}

/**
 * A token bucket of retries, as AWS SDKs keep one: each retry spends a
 * share of it — one after a timeout, which keeps an upstream waiting
 * longest, twice as much — and an answer gives back what its last retry
 * spent, or a little when it needed none. While an upstream fails, its
 * callers' retries stop once the bucket is empty, rather than piling onto
 * it as it tries to recover; answers fill it again.
 *
 * @returns An empty-handed budget at full capacity
 * @example
 * ```ts
 * const budget = retryBudget();
 * const spent = budget.spend(failure); // undefined: send no retry
 * ```
 */
export function retryBudget(): RetryBudget {
  const { capacity, cost, timeoutCost, refill } = RETRY_DEFAULTS.budget;
  let left: number = capacity;
  return {
    spend(failure) {
      const price = failure.kind === "timeout" ? timeoutCost : cost;
      if (left < price) return undefined;
      left -= price;
      return price;
    },
    answered(spent) {
      left = Math.min(capacity, left + (spent ?? refill));
    },
  };
}
