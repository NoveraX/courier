/* The statuses `fetch` follows: a 300 or a 304 names nothing to go to. */
const REDIRECTS: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

/* A stream's refusal carries 4000 and the status of the answer that refused it. */
const STREAM_STATUS_BASE = 4000;

const ROUTE_REMEDY =
  "Point proxyPath at the route itself, or set COURIER_APP_URL to the origin that serves it.";

const UPSTREAM_REMEDY =
  "Point the source's baseURL where the API redirects — https rather than http, say — or set " +
  'redirect: "follow" on a source that trusts every redirect its API sends.';

/**
 * Why a Playground call through the proxy stopped at a redirect the app's
 * proxy route answered with, and what to do. The call follows a redirect
 * only on the route's own origin, so it, its headers and Studio's one-time
 * pass never leave for one the route — or whatever answers at its address —
 * names.
 *
 * @param location - Where the redirect pointed
 * @returns The advice
 * @example
 * ```ts
 * redirectAdvice("http://other.example/api/request");
 * ```
 */
export function redirectAdvice(location: string): string {
  return (
    `The app's proxy route answered with a redirect it does not follow (${location}): a ` +
    "Playground call through the proxy follows a redirect only on the route's own origin, so the " +
    `call, its headers and Studio's pass stayed there. ${ROUTE_REMEDY}`
  );
}

/**
 * Why a Playground call through the proxy failed on a redirect the API
 * answered the proxy with, and what to do. The proxy follows an upstream's
 * redirect only on the API's own origin, so the source's credentials never
 * reach another host, and answers one elsewhere with its status alone.
 *
 * @returns The advice
 * @example
 * ```ts
 * const error = location === null ? upstreamRedirectAdvice() : redirectAdvice(location);
 * ```
 */
export function upstreamRedirectAdvice(): string {
  return (
    "The API answered the app's proxy with a redirect to another origin, which the proxy does not " +
    `follow, so the source's credentials stayed on the API's own. ${UPSTREAM_REMEDY}`
  );
}

/**
 * Why a Playground stream through the proxy ended on a redirect. A stream's
 * refusal does not say what answered with it — the app's proxy route or the
 * API the proxy relays — so the advice names both.
 *
 * @returns The advice, naming both
 * @example
 * ```ts
 * const message = isStreamRedirect(err) ? streamRedirectAdvice() : String(err);
 * ```
 */
export function streamRedirectAdvice(): string {
  return (
    "The stream ended on a redirect to another origin, which neither a Playground call nor the " +
    "app's proxy follows. If the app's proxy route answered with it: " +
    `${ROUTE_REMEDY} If the API answered the proxy with it: ${UPSTREAM_REMEDY}`
  );
}

/**
 * Whether an HTTP answer is a redirect the call did not follow.
 *
 * @param status - The answer's status
 * @returns `true` for a status `fetch` would follow: 301, 302, 303, 307 or 308
 * @example
 * ```ts
 * isRedirectStatus(307); // → true
 * isRedirectStatus(304); // → false
 * ```
 */
export function isRedirectStatus(status: number): boolean {
  return REDIRECTS.has(status);
}

/**
 * Whether a stream ended on a redirect it did not follow.
 *
 * @param error - What the stream failed with
 * @returns `true` when its code says a redirect answered it
 * @example
 * ```ts
 * const message = isStreamRedirect(err) ? streamRedirectAdvice() : String(err);
 * ```
 */
export function isStreamRedirect(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code: unknown = Reflect.get(error, "code");
  return typeof code === "number" && isRedirectStatus(code - STREAM_STATUS_BASE);
}
