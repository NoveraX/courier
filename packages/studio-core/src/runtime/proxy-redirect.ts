/* Codes a stream's refusal carries for a redirect status: 4000 and the status. */
const STREAM_REDIRECTS = { from: 4300, to: 4399 } as const;

/**
 * Why a Playground call through the proxy stopped at a redirect, and what to
 * do. The call follows a redirect only on the route's own origin, so it,
 * its headers and Studio's one-time pass never leave for one the route — or
 * whatever answers at its address — names.
 *
 * @param location - Where the redirect pointed, when the answer said
 * @returns The advice
 * @example
 * ```ts
 * redirectAdvice("http://other.example/api/request");
 * ```
 */
export function redirectAdvice(location?: string | null): string {
  const where = location ? ` (${location})` : "";
  return (
    `The app's proxy route answered with a redirect it does not follow${where}: a Playground ` +
    "call through the proxy follows a redirect only on the route's own origin, so the call, its " +
    "headers and Studio's pass stayed there. Point proxyPath at the route itself, or set " +
    "COURIER_APP_URL to the origin that serves it."
  );
}

/**
 * Whether an HTTP answer is a redirect the call did not follow.
 *
 * @param status - The answer's status
 * @returns `true` for a 3xx
 * @example
 * ```ts
 * isRedirectStatus(307); // → true
 * ```
 */
export function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

/**
 * Whether a stream ended on a redirect it did not follow.
 *
 * @param error - What the stream failed with
 * @returns `true` when its code says a 3xx answered it
 * @example
 * ```ts
 * const message = isStreamRedirect(err) ? redirectAdvice() : String(err);
 * ```
 */
export function isStreamRedirect(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code: unknown = Reflect.get(error, "code");
  return typeof code === "number" && code >= STREAM_REDIRECTS.from && code <= STREAM_REDIRECTS.to;
}
