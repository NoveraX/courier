import { platformError } from "./platform-error";

/**
 * A signal that aborts once the time runs out, with a `TimeoutError`:
 * `AbortSignal.timeout` where the runtime has it, a timer where it has not —
 * React Native without Expo.
 *
 * @param ms - How long to wait, in milliseconds
 * @returns The signal
 * @example
 * ```ts
 * await fetch(url, { signal: timeoutSignal(5_000) });
 * ```
 */
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(platformError("The operation timed out", "TimeoutError")), ms);
  return controller.signal;
}
