import { timeoutSignal } from "../../utils/timeout-signal";

/**
 * The signal a request's own timeout aborts, as a page's bundle has it: its
 * time runs from the moment the request is sent. A page sends no upload the
 * proxy sends on as it arrives, whose timeout would wait for it; a bundler
 * that builds for the browser takes this module in place of the server's.
 *
 * @param timeout - The request's timeout, in ms
 * @param _body - The request's body
 * @returns The signal, aborted with a `TimeoutError` once the time is out
 * @example
 * ```ts
 * const expiry = attemptExpiry(30_000, init.body);
 * ```
 */
export function attemptExpiry(timeout: number, _body: unknown): AbortSignal {
  return timeoutSignal(timeout);
}
