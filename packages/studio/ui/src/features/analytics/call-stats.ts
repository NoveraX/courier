import { isFailedState } from "@/features/requests/request-state";
import type { RequestEntry } from "@/store/types";

/**
 * Whether a call failed: an error, or a response that broke its schema.
 *
 * @param r - The call
 * @returns Whether it failed
 * @example
 * ```ts
 * isFailure({ status: "validation_error" }); // true
 * ```
 */
export function isFailure(r: Pick<RequestEntry, "status">): boolean {
  return isFailedState(r.status);
}

/**
 * How long the requests took — those cut short left out, since an aborted
 * call's time is the caller's, not the server's.
 *
 * @param requests - The calls that sent a request of their own
 * @returns Their durations, ms, in their order
 * @example
 * ```ts
 * durationsOf(win.sent); // [61, 140, 2210]
 * ```
 */
export function durationsOf(requests: readonly RequestEntry[]): number[] {
  return requests.flatMap((r) =>
    r.status === "aborted" || r.timing === undefined ? [] : [r.timing.total],
  );
}

/**
 * The share of the calls that succeeded, as a percentage.
 *
 * @param calls - The calls
 * @returns 0–100, or `null` for no calls
 * @example
 * ```ts
 * successRate(calls); // 91.9
 * ```
 */
export function successRate(calls: readonly RequestEntry[]): number | null {
  if (calls.length === 0) return null;
  return (calls.filter((r) => r.status === "success").length / calls.length) * 100;
}

/**
 * The share of the calls that failed, as a percentage.
 *
 * @param calls - The calls
 * @returns 0–100, or `null` for no calls
 * @example
 * ```ts
 * failureRate(calls); // 7.1
 * ```
 */
export function failureRate(calls: readonly RequestEntry[]): number | null {
  if (calls.length === 0) return null;
  return (calls.filter(isFailure).length / calls.length) * 100;
}

/**
 * How many bytes the calls' responses came to.
 *
 * @param calls - The calls
 * @returns The bytes
 * @example
 * ```ts
 * totalSize(calls); // 667_545
 * ```
 */
export function totalSize(calls: readonly RequestEntry[]): number {
  return calls.reduce((sum, r) => sum + (r.size ?? 0), 0);
}

/**
 * How many bytes a call's response came to on average.
 *
 * @param calls - The calls
 * @returns The bytes, or `null` for no calls
 * @example
 * ```ts
 * averageSize(calls); // 3379
 * ```
 */
export function averageSize(calls: readonly RequestEntry[]): number | null {
  return calls.length === 0 ? null : totalSize(calls) / calls.length;
}
