import { ONCE } from "./own-options";

/**
 * Wait for a step, given up as soon as `signal` aborts: a hook takes no
 * signal, and a `fetch` of the source's own may not pass it on. What the
 * step gives once given up is handed to `letGo`, so an answer that comes
 * late has its body let go of.
 *
 * @param signal - The attempt's
 * @param step - What it waits for
 * @param letGo - Told of what came after the attempt was given up
 * @returns What the step gave
 * @throws The signal's reason once it aborts, or what the step threw
 * @example
 * ```ts
 * const response = await withinSignal(signal, fetch(url, { signal }), (late) => {
 *   late.body?.cancel().catch(() => undefined);
 * });
 * ```
 */
export function withinSignal<T>(
  signal: AbortSignal,
  step: T | PromiseLike<T>,
  letGo?: (late: T) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abandon = () => reject(signal.reason);
    if (signal.aborted) abandon();
    else signal.addEventListener("abort", abandon, ONCE);
    Promise.resolve(step).then(
      (value) => {
        signal.removeEventListener("abort", abandon);
        if (signal.aborted) letGo?.(value);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abandon);
        reject(error);
      },
    );
  });
}
