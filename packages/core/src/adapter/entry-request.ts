/**
 * What an entry point's gate reads of a request, whichever server read it:
 * a web `Request`, or Node's own request, for which none is made.
 */

/** A request's headers as the gate reads them, and the one it takes off: a web request's own `Headers` will do. */
export type EntryHeaders = Pick<Headers, "get" | "has" | "delete">;

/** A request as the gate reads it. */
export interface EntryRequest {
  readonly method: string;
  /**
   * The URL it was addressed to, as its server read it: the scheme and host
   * of a local proxy's `X-Forwarded-Proto` and `X-Forwarded-Host` where
   * there is one, else the socket's and its `Host`
   */
  readonly url: URL;
  readonly headers: EntryHeaders;
}

/**
 * A web request, as the gate reads it.
 *
 * @param request - The request
 * @returns It, its URL read once
 * @example
 * ```ts
 * const verdict = checkEntry(entryRequestOf(request), config, dt, refusals);
 * ```
 */
export function entryRequestOf(request: Request): EntryRequest {
  return { method: request.method, url: new URL(request.url), headers: request.headers };
}
