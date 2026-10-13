import { ConfigurationError } from "../../errors/configuration-error";
import { isRecord } from "../../utils/is-record";

/**
 * Refuse, where the handler is made, a `rateLimit` that could not work as
 * written: a budget that is not a whole number of calls over a window of
 * milliseconds, or a key or a store that is not one.
 *
 * @param rateLimit - The handler's `rateLimit`
 * @param where - What the handler is, named in the error
 * @throws ConfigurationError `RATE_LIMIT_INVALID`
 * @example
 * ```ts
 * assertRateLimit({ requests: 300, window: 60_000 }, "createHandler");
 * ```
 */
export function assertRateLimit(rateLimit: unknown, where: string): void {
  if (rateLimit === undefined) return;
  const problem = rateLimitProblem(rateLimit);
  if (problem !== undefined) {
    throw new ConfigurationError("RATE_LIMIT_INVALID", `${where}: rateLimit ${problem}`);
  }
}

function rateLimitProblem(rateLimit: unknown): string | undefined {
  if (!isRecord(rateLimit)) return "is an object: { requests, window, writes, key, store }";
  const budget = budgetProblem(rateLimit);
  if (budget !== undefined) return budget;
  const { writes, key, store } = rateLimit;
  if (writes !== undefined) {
    const problem = isRecord(writes) ? budgetProblem(writes) : "is an object: { requests, window }";
    if (problem !== undefined) return `writes ${problem}`;
  }
  if (key !== undefined && typeof key !== "function") return "key is a function of the request";
  if (store !== undefined && !(isRecord(store) && typeof store.take === "function")) {
    return "store is a RateLimitStore, with take(key, limit)";
  }
  return undefined;
}

function budgetProblem({ requests, window }: Record<string, unknown>): string | undefined {
  if (typeof requests !== "number" || !Number.isInteger(requests) || requests < 1) {
    return `requests is a whole number of calls, 1 or more; got ${String(requests)}`;
  }
  if (typeof window !== "number" || !Number.isFinite(window) || window < 1) {
    return `window is a number of milliseconds, 1 or more; got ${String(window)}`;
  }
  return undefined;
}
