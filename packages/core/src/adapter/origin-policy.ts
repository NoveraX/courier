/**
 * One origin rule for every transport the adapter serves.
 *
 * The threat this defends against is a third-party page driving the proxy with
 * the user's ambient cookies. That attack needs a browser, and a browser
 * always sends `Origin` when a page reaches across origins — on `fetch`, on a
 * form POST, on `EventSource`, and on a WebSocket upgrade. So the rule follows
 * from what the header means:
 *
 *  - **absent** — not a cross-origin browser request. Either the page is
 *    same-origin or the caller is not a browser at all, and neither can be
 *    driven by a hostile page. Allowed.
 *  - **equal to the request's own origin** — same-origin. Allowed.
 *  - **anything else** — allowed only if it was configured.
 *
 * A deployment that configures nothing therefore keeps working for its own
 * pages and refuses every other site, which is the behaviour a deployment
 * needs from a default.
 *
 * Development makes one narrow allowance, and only while nothing is
 * configured: another port **on the local machine** is admitted, because the
 * Studio serves itself from one and inspects an app on another. It is scoped
 * to loopback rather than opened to everything, so a page on the public
 * internet is refused in development exactly as it is in production.
 * Configuring `allowedOrigins` replaces the allowance with the list.
 */

/**
 * Decide whether a request's `Origin` is acceptable.
 *
 * @param request - The incoming request
 * @param allowedOrigins - Extra origins to accept, `*.example.com` supported
 * @returns Whether the request may proceed
 *
 * @example
 * ```ts
 * isOriginAllowed(request); // same-origin and non-browser callers pass
 * isOriginAllowed(request, ["https://studio.example.com"]);
 * ```
 */
export function isOriginAllowed(request: Request, allowedOrigins?: string[]): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;

  if (origin === selfOrigin(request)) return true;

  if (allowedOrigins?.length) {
    return allowedOrigins.some((pattern) => matchesOrigin(origin, pattern));
  }

  return process.env.NODE_ENV !== "production" && isLoopback(origin);
}

/** True for another port on the developer's own machine. */
function isLoopback(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    /* An origin that does not parse is not a machine we can recognise. */
    return false;
  }
}

/**
 * The origin the request was addressed to. A hostile page cannot forge this
 * into a match: the browser sets `Host` to the site it is calling and `Origin`
 * to the page it is calling from, so the two differ precisely when it matters.
 */
function selfOrigin(request: Request): string | null {
  try {
    return new URL(request.url).origin;
  } catch {
    /* A handler that was handed a malformed URL has no origin to compare
       against, so the request falls through to the configured list. */
    return null;
  }
}

/** Case-insensitive match; `*.example.com` covers sub-domains but not the apex. */
function matchesOrigin(origin: string, pattern: string): boolean {
  const candidate = origin.toLowerCase();
  const allowed = pattern.toLowerCase();
  if (candidate === allowed) return true;
  if (allowed.startsWith("*.")) return candidate.endsWith(`.${allowed.slice(2)}`);
  return false;
}
