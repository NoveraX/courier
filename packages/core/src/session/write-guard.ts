import { isOriginAccepted, isOriginListed } from "../adapter/origin-policy";
import type { IncomingRequest } from "./incoming-request";

/* Methods a browser sends for a link, an image or a page another site shows. */
const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

/**
 * Why a write may not carry the user's session while the application serves
 * this request — or `undefined`, when it may.
 *
 * A page on another site can make the user's browser send the application a
 * request, with the user's cookies on it; carrying the session into a write
 * then acts for the user without their asking — the request forgery the
 * API's own defences exist to stop, and the session would walk past them.
 * So a write carries it only for a request the application's own pages made:
 *
 *  - a form, a Server Action or a `fetch` — POST and the like — passes the
 *    proxy's origin rule: `Sec-Fetch-Site` says same-origin, or else its
 *    `Origin` is the application's, or it is no browser's request at all;
 *  - a page — GET and the like, which any link elsewhere can request — has
 *    to be one the browser says came from the application itself, or that
 *    the user opened themselves; a browser too old to say so has to name a
 *    page of the application as its `Referer`.
 *
 * An origin in `allowedOrigins` counts as the application's own; with none
 * configured, so does another port of the local machine in development,
 * whose form posts with an `Origin` — the proxy's own allowance, for a
 * front end its developer serves from one.
 *
 * @param incoming - The request being served
 * @param allowedOrigins - Other origins whose pages may make writes
 * @returns The reason the write is refused, or `undefined`
 * @example
 * ```ts
 * writeRefusal({ ...incoming, method: "GET", headers: new Headers({ "sec-fetch-site": "cross-site" }) });
 * // "a page on another site may have requested it (Sec-Fetch-Site: cross-site)"
 * ```
 */
export function writeRefusal(
  incoming: IncomingRequest,
  allowedOrigins?: readonly string[],
): string | undefined {
  const site = incoming.headers.get("sec-fetch-site")?.toLowerCase() ?? null;
  const origin = incoming.headers.get("origin");
  const self = incoming.origin ?? null;
  if (!SAFE_METHODS.has((incoming.method ?? "GET").toUpperCase())) {
    return isOriginAccepted(origin, self, allowedOrigins, site)
      ? undefined
      : `it came from ${origin ?? `a page the browser calls ${site}`}, not one of the application's pages`;
  }
  if (site !== null) {
    if (site === "same-origin" || site === "none") return undefined;
    if (origin !== null && isOriginListed(origin, allowedOrigins)) return undefined;
    return `a page on another site may have requested it (Sec-Fetch-Site: ${site})`;
  }
  return refererRefusal(incoming.headers.get("referer"), self, allowedOrigins);
}

/* A browser that sends no Sec-Fetch-Site still names the page a link was on. */
function refererRefusal(
  referer: string | null,
  self: string | null,
  allowedOrigins: readonly string[] | undefined,
): string | undefined {
  const from = referer !== null && URL.canParse(referer) ? new URL(referer).origin : undefined;
  if (from !== undefined && (from === self || isOriginListed(from, allowedOrigins))) {
    return undefined;
  }
  return from === undefined
    ? "nothing says which page requested it"
    : `the page that requested it is on ${from}`;
}
