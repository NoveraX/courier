/**
 * The calls a proxy client cancels when a newer call to the same endpoint
 * starts — the reads `cancelPrevious` is on for, a search as the user
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

/* The calls in flight of every proxy client given the same routes, as a
   direct call's are those of every client of its API. */
const callsByRoutes = new WeakMap<object, ProxyCancelPrevious>();

/**
 * The calls in flight a proxy client shares with every other client given
 * the same routes: a newer call through one cancels an older call through
 * another, as two direct clients of one API cancel each other's.
 *
 * @param routes - The routes the client was given, if it has them
 * @returns Their table, or a table of the client's own when it has none
 * @example
 * ```ts
 * const calls = proxyCancelPreviousOf(apiRoutes);
 * ```
 */
export function proxyCancelPreviousOf(routes: object | undefined): ProxyCancelPrevious {
  if (routes === undefined) return createProxyCancelPrevious();
  let calls = callsByRoutes.get(routes);
  if (calls === undefined) {
    calls = createProxyCancelPrevious();
    callsByRoutes.set(routes, calls);
  }
  return calls;
}

/**
 * Calls a newer one to the same endpoint cancels.
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
