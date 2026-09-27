/**
 * One origin rule for every transport the adapter serves.
 *
 * The threat this defends against is a third-party page driving the proxy with
 * the user's ambient cookies. That attack needs a browser, and a browser
 * describes where a request comes from in two headers:
 *
 *  - `Sec-Fetch-Site` is the browser's own verdict — `same-origin`,
 *    `same-site`, `cross-site`, or `none` for what the user typed. No page can
 *    write it, and it does not depend on the server knowing its own name, so
 *    where it is present it decides. It is present on every request a current
 *    browser makes to a secure origin (HTTPS, or the local machine), including
 *    an `<img>` or a link that carries no `Origin` at all.
 *  - `Origin` names the page. Where the browser says nothing else — an older
 *    browser, or a site served over plain HTTP — it is compared with the origin
 *    the request was addressed to. A request with neither header is not a
 *    cross-origin browser request, so it is served.
 *
 * A page on another origin is served only if it was configured.
 *
 * Development makes one narrow allowance, and only while nothing is
 * configured: another port **on the local machine** is admitted, because the
 * Studio serves itself from one and inspects an app on another. It is scoped
 * to loopback rather than opened to everything, so a page on the public
 * internet is refused in development exactly as it is in production.
 * Configuring `allowedOrigins` replaces the allowance with the list.
 */

/**
 * Decide whether a request may proceed, from where the browser says it comes.
 *
 * @param request - The incoming request
 * @param allowedOrigins - Extra origins to accept; see {@link isOriginAccepted}
 * @returns Whether the request may proceed
 *
 * @example
 * ```ts
 * isOriginAllowed(request); // same-origin and non-browser callers pass
 * isOriginAllowed(request, ["https://studio.example.com"]);
 * ```
 */
export function isOriginAllowed(request: Request, allowedOrigins?: string[]): boolean {
  return isOriginAccepted(
    request.headers.get("Origin"),
    selfOrigin(request),
    allowedOrigins,
    request.headers.get("Sec-Fetch-Site"),
  );
}

/**
 * The same rule, for a server that speaks in parts rather than in `Request`.
 *
 * @param origin - The `Origin` header, or null when absent
 * @param self - The origin the request was addressed to
 * @param allowedOrigins - Extra origins to accept, `*.example.com` supported
 * @param fetchSite - The `Sec-Fetch-Site` header, or null when absent
 * @returns Whether the request may proceed
 *
 * @example
 * ```ts
 * isOriginAccepted(req.headers.origin, "https://app.example.com", undefined, req.headers["sec-fetch-site"]);
 * ```
 */
export function isOriginAccepted(
  origin: string | null | undefined,
  self: string | null,
  allowedOrigins?: string[],
  fetchSite?: string | null,
): boolean {
  const site = fetchSite?.toLowerCase();
  if (site === "same-origin" || site === "none") return true;
  /* The browser says another page made this request, and only a configured
     page may; without an `Origin` there is nothing to find in the list. */
  if (site) return !!origin && isConfigured(origin, allowedOrigins);

  if (!origin) return true;
  if (origin === self) return true;
  return isConfigured(origin, allowedOrigins);
}

/** Whether a foreign origin was listed, or is a local port during development. */
function isConfigured(origin: string, allowedOrigins?: string[]): boolean {
  if (allowedOrigins?.length) {
    return allowedOrigins.some((pattern) => matchesOrigin(origin, pattern));
  }
  return process.env.NODE_ENV !== "production" && isLoopback(origin);
}

/** True for another port on the developer's own machine. */
function isLoopback(origin: string): boolean {
  const parsed = parseOrigin(origin);
  return (
    parsed?.hostname === "localhost" ||
    parsed?.hostname === "127.0.0.1" ||
    parsed?.hostname === "[::1]"
  );
}

/**
 * The origin the request was addressed to. A hostile page cannot forge this
 * into a match: the browser sets `Host` to the site it is calling and `Origin`
 * to the page it is calling from, so the two differ precisely when it matters.
 */
function selfOrigin(request: Request): string | null {
  return parseOrigin(request.url)?.origin ?? null;
}

/** Case-insensitive match; `*.example.com` covers sub-domains but not the apex. */
function matchesOrigin(origin: string, pattern: string): boolean {
  const candidate = origin.toLowerCase();
  const allowed = pattern.toLowerCase();
  if (candidate === allowed) return true;
  if (allowed.startsWith("*.")) return candidate.endsWith(`.${allowed.slice(2)}`);
  return false;
}

/** Parse an origin or URL, or nothing when it does not parse. */
function parseOrigin(value: string): URL | undefined {
  /* A malformed value names no machine, so it matches nothing and the caller
     falls through to the configured list. */
  return URL.canParse(value) ? new URL(value) : undefined;
}
