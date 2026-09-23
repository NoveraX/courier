/**
 * Latest-wins deduplication for a browser proxy client.
 *
 * A search box sends a request per keystroke; only the last answer matters.
 * With deduplication on, a call cancels the one still in flight for the same
 * endpoint, which rejects with an `HTTPError` of status 499 — the same as in
 * direct mode. It runs in the browser, per client: the proxy server cannot
 * do it, because requests from different users reach it under the same key.
 */

import { cleanupDeduplication, deduplicateAndAbortPrevious } from "../utils/deduplicate";

export interface ProxyDedupe {
  /**
   * Send a request, cancelling the previous one with the same key.
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
 * Create the in-flight table for one proxy client.
 *
 * @returns The deduplicating runner
 *
 * @example
 * ```ts
 * const dedupe = createProxyDedupe();
 * await dedupe.run("api:users.search", undefined, (signal) => fetch(url, { signal }));
 * ```
 */
export function createProxyDedupe(): ProxyDedupe {
  const host = { pendingRequests: {} as Record<string, AbortController> };
  return {
    async run(key, signal, send) {
      const controller = deduplicateAndAbortPrevious(host, key);
      try {
        return await send(
          signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
        );
      } finally {
        cleanupDeduplication(host, key, controller);
      }
    },
  };
}
