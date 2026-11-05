import { AbortError } from "../errors/abort-error";
import { CourierError } from "../errors/courier-error";

/**
 * What a cancelled call rejects with, wherever the cancellation meets it —
 * fetch, a wait between attempts, a queue, a shared request. A Courier
 * error its signal aborted with stays as it is: a deadline that ran out, a
 * newer call that superseded it. Anything else — the reason the caller
 * gave, the platform's own `AbortError`, or the error a cancelled request
 * was rejected with when its signal holds none — is the `cause` of an
 * `AbortError`.
 *
 * @param signal - The call's signal
 * @param error - What the cancelled work was rejected with, read when the signal has not aborted
 * @returns The error to reject the call with
 * @example
 * ```ts
 * if (signal.aborted) throw cancellation(signal);
 * ```
 */
export function cancellation(
  signal: AbortSignal | null | undefined,
  error?: unknown,
): CourierError {
  const reason: unknown = signal?.aborted ? (signal.reason ?? error) : error;
  return reason instanceof CourierError ? reason : new AbortError({ cause: reason });
}
