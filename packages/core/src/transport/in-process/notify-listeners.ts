import { createLogger } from "../../logger";

const log = createLogger("WS");

/**
 * Call each listener with the value. One that throws must not keep the value
 * from the others, so its failure is logged and the rest are still called.
 *
 * @param listeners - The listeners to call, in order
 * @param value - What each of them receives
 * @param kind - What the value is, for the log line of a failing listener
 *
 * @example
 * ```ts
 * notifyListeners(statusListeners, "connected", "status");
 * ```
 */
export function notifyListeners<TValue>(
  listeners: Iterable<(value: TValue) => void>,
  value: TValue,
  kind: "data" | "status",
): void {
  for (const fn of listeners) {
    try {
      fn(value);
    } catch (error) {
      log.error(`A channel ${kind} listener failed`, error);
    }
  }
}
