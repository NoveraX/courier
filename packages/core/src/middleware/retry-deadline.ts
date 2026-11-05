import { TimeoutError } from "../errors/timeout-error";
import { anySignal } from "../utils/any-signal";

/** A call's deadline, counted from its first attempt across every wait. */
export interface Deadline {
  /** The call's signal, aborted too once the deadline passes, with a `TimeoutError`. */
  readonly signal: AbortSignal;
  /** How much of it is left, in ms. */
  left(): number;
  /** Let it go once the call is over: its timer stops. */
  end(): void;
}

/**
 * Start a call's deadline. Its signal aborts with a `TimeoutError` of scope
 * `"deadline"` once the time is up, so an attempt in flight stops then and
 * a wait between attempts ends with it; the caller's own cancellation goes
 * through it as before.
 *
 * @param ms - How long the call may take, in ms
 * @param signal - The call's own signal, if it has one
 * @returns The deadline
 * @example
 * ```ts
 * const deadline = startDeadline(10_000, ctx.signal);
 * try { … } finally { deadline.end(); }
 * ```
 */
export function startDeadline(ms: number, signal: AbortSignal | undefined): Deadline {
  const controller = new AbortController();
  const started = performance.now();
  const timer = setTimeout(
    () => controller.abort(new TimeoutError({ scope: "deadline", timeout: ms })),
    ms,
  );
  return {
    signal: signal ? anySignal([signal, controller.signal]) : controller.signal,
    left: () => ms - (performance.now() - started),
    end: () => clearTimeout(timer),
  };
}
