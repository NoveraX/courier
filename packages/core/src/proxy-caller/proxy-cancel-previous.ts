/**
 * The calls a proxy client cancels when a newer call to the same endpoint
 * starts — the endpoints its `cancelPrevious` names, a search as the user
 * types — whatever variables each was called with.
 */

import { anySignal } from "../utils/any-signal";
import { forgetCall, supersedeCall } from "../utils/cancel-previous";

export interface ProxyCancelPrevious {
  /**
   * Send a request, cancelling the one still in flight to the same endpoint.
   *
   * @param key - Identifies the endpoint the request goes to
   * @param signal - The caller's own signal, if it gave one
   * @param send - Sends the request with the signal it should honour
   * @returns Whatever `send` returns
   */
  run<TResult>(
    key: string,
    signal: AbortSignal | null | undefined,
    send: (signal: AbortSignal) => Promise<TResult>,
  ): Promise<TResult>;
}

/**
 * Calls a newer one to the same endpoint cancels, kept for one proxy client.
 *
 * @returns The table of calls in flight, and how to send through it
 * @example
 * ```ts
 * const calls = createProxyCancelPrevious();
 * await calls.run("api:users.search", undefined, (signal) => fetch(url, { signal }));
 * ```
 */
export function createProxyCancelPrevious(): ProxyCancelPrevious {
  const host = { pendingRequests: {} as Record<string, AbortController> };
  return {
    async run(key, signal, send) {
      const { controller, cancelSuperseded } = supersedeCall(host, key);
      try {
        const sending = send(signal ? anySignal([signal, controller.signal]) : controller.signal);
        cancelSuperseded();
        return await sending;
      } finally {
        forgetCall(host, key, controller);
      }
    },
  };
}
