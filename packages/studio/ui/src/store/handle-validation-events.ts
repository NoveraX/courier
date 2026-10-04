import type { RequestEntry, ValidationTarget } from "./types-request";

/**
 * Record how a request's validation of its variables or its response ended,
 * as `validation:pass` and `validation:fail` report it.
 *
 * A request whose endpoint declares a schema is not validated whenever it
 * runs: one that fails before its answer is read never checks the response.
 * Kept per target, so the request is shown as validated only when it was.
 *
 * @param r - The request
 * @param target - What was validated, as the event names it
 * @param outcome - How it ended
 * @returns The request with the outcome, or as it was for a target it has not
 * @example
 * ```ts
 * withValidationOutcome(request, event.target, "passed");
 * ```
 */
export function withValidationOutcome(
  r: RequestEntry,
  target: unknown,
  outcome: "passed" | "failed",
): RequestEntry {
  if (!isTarget(target)) return r;
  const validated =
    target === "variables"
      ? { ...r.validated, variables: outcome }
      : { ...r.validated, response: outcome };
  return { ...r, validated };
}

function isTarget(value: unknown): value is ValidationTarget {
  return value === "variables" || value === "response";
}
