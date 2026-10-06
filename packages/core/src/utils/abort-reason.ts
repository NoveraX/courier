import { platformError } from "./platform-error";

/**
 * Why a signal aborted: the reason it was given, or an `AbortError` where
 * the runtime keeps none. React Native's `AbortController` drops the reason
 * `abort()` is called with, so a cancellation rethrown as its signal's
 * `reason` reached the caller as `undefined`.
 *
 * @param signal - An aborted signal
 * @returns What a cancellation through it is thrown as
 * @example
 * ```ts
 * if (signal.aborted) throw abortReason(signal);
 * ```
 */
export function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? platformError("This operation was aborted", "AbortError");
}
