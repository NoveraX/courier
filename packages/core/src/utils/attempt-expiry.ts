import { platformError } from "./platform-error";
import { timeoutSignal } from "./timeout-signal";
import { sendingOf } from "./upload-sending";

/* The longest delay a timer takes as given (2^31 - 1 ms); past it, one would fire at once. */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * The signal a request's own timeout aborts. Its time runs from the moment
 * the request is sent. An upload the proxy sends on as it arrives is held to
 * it wait by wait instead: each wait for the upstream to take the next piece,
 * and the wait for its answer once the upload has been sent whole. The time
 * the client takes to send a piece is the body's own limits' to hold — its
 * idle time, its whole time however slowly the upstream takes it — and a
 * slow client is no slow upstream. An upload that stops short is not waited
 * on for an answer: the request fails with why it stopped. A page sends no
 * such upload, and its bundle takes a stand-in that starts every timeout at
 * once.
 *
 * @param timeout - The request's timeout, in ms
 * @param body - The request's body
 * @returns The signal, aborted with a `TimeoutError` once the time is out
 * @example
 * ```ts
 * const expiry = attemptExpiry(30_000, init.body);
 * ```
 */
export function attemptExpiry(timeout: number, body: unknown): AbortSignal {
  const sending = sendingOf(body);
  if (sending === undefined) return timeoutSignal(timeout);
  const controller = new AbortController();
  if (timeout > MAX_TIMER_MS) return controller.signal;
  const expire = (): void => {
    controller.abort(platformError("The operation timed out", "TimeoutError"));
  };
  sending.holdWaits(timeout, expire);
  void sending.ended.then((whole) => {
    if (!whole) return;
    const timer = setTimeout(expire, timeout);
    /* A timeout must not keep a server that is shutting down alive. */
    if (typeof timer === "object" && "unref" in timer) timer.unref();
  });
  return controller.signal;
}
