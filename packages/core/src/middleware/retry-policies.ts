import type { RetryOptions } from "../define/options";
import { retryPolicy } from "./retry";
import { type RetryBudget, retryBudget } from "./retry-budget";
import type { WrapHandler } from "./types";

/** The retry policies of one API's endpoints, each made once, and the budget they share. */
interface ApiPolicies {
  readonly budget: RetryBudget;
  readonly made: WeakMap<RetryOptions, WrapHandler>;
}

/* By the API they belong to, which keeps them only as long as it lives. */
const policiesOf = new WeakMap<object, ApiPolicies>();

/**
 * The retry policy an endpoint's `.retry()` options make, made once and
 * spending the budget its API's endpoints share — loaded with the first
 * call that has one, so a page whose endpoints retry nothing never loads
 * the policy's code.
 *
 * @param source - The API the endpoint belongs to
 * @param options - The endpoint's retry options, as its definition resolved them
 * @returns The policy's handler
 * @throws {ConfigurationError} `RETRY_OPTIONS_INVALID`, for options it cannot work with
 * @example
 * ```ts
 * return endpointRetry(dataSource, options)(ctx, next);
 * ```
 */
export function endpointRetry(source: object, options: RetryOptions): WrapHandler {
  let policies = policiesOf.get(source);
  if (policies === undefined) {
    policies = { budget: retryBudget(), made: new WeakMap() };
    policiesOf.set(source, policies);
  }
  let handler = policies.made.get(options);
  if (handler === undefined) {
    handler = retryPolicy(options, policies.budget).handler;
    policies.made.set(options, handler);
  }
  return handler;
}
