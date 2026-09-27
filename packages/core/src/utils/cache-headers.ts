import type { SchemaMetadata } from "../validation";

/**
 * Request headers that do not say who is asking.
 *
 * The decision used to run the other way, naming the credentials it knew —
 * and a caller authenticating with anything else, an `X-Api-Key` say, got a
 * response marked cacheable by every CDN between them and the server. Listing
 * what is safe instead means an unfamiliar header makes the answer private
 * rather than public.
 *
 * The list covers what a browser sends on its own, and what the hops between
 * it and the server stamp on every request: reverse proxies, load balancers,
 * CDNs and hosting platforms describe the route and the network the request
 * came from, never the user. Next.js adds the four `x-forwarded-*` headers to
 * each request itself, so without them no response it served was ever
 * offered to a shared cache. A header an edge adds to vouch for a user —
 * Cloudflare Access's `cf-access-jwt-assertion` — is left off on purpose.
 */
const IMPERSONAL_REQUEST_HEADERS: ReadonlySet<string> = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "cache-control",
  "connection",
  "content-length",
  "content-type",
  "dnt",
  "host",
  "origin",
  "pragma",
  "referer",
  "te",
  "upgrade-insecure-requests",
  "user-agent",
  /* Reverse proxies and load balancers */
  "forwarded",
  "via",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-prefix",
  "x-forwarded-proto",
  "x-forwarded-server",
  "x-real-ip",
  "true-client-ip",
  "cdn-loop",
  /* Tracing, one fresh id per request */
  "traceparent",
  "tracestate",
  "x-request-id",
  "x-amzn-trace-id",
  "x-amz-cf-id",
  /* Cloudflare */
  "cf-connecting-ip",
  "cf-connecting-ipv6",
  "cf-ipcountry",
  "cf-ray",
  "cf-visitor",
  "cf-worker",
  /* Vercel */
  "x-vercel-id",
  "x-vercel-deployment-url",
  "x-vercel-forwarded-for",
  "x-vercel-proxied-for",
]);

/** Header families that are impersonal as a whole. */
const IMPERSONAL_REQUEST_HEADER_PREFIXES: readonly string[] = [
  "sec-fetch-",
  "sec-ch-",
  /* Where the request came from, derived from its address. */
  "x-vercel-ip-",
];

/** Whether anything in the request ties the answer to one caller. */
function identifiesCaller(request: Request | undefined): boolean {
  if (!request) return true;
  for (const name of request.headers.keys()) {
    const header = name.toLowerCase();
    if (IMPERSONAL_REQUEST_HEADERS.has(header)) continue;
    if (IMPERSONAL_REQUEST_HEADER_PREFIXES.some((prefix) => header.startsWith(prefix))) continue;
    return true;
  }
  return false;
}

/**
 * Describe to caches how long this response keeps, and to whom it belongs.
 *
 * A response produced from a request carrying credentials is that caller's
 * alone, so it is kept privately in their own client rather than offered to a
 * shared cache. Otherwise it may be shared, and `Vary` names every forwarded
 * header that could have changed it so a shared cache keys on them instead of
 * handing one caller's response to another.
 *
 * @param response - The proxy's answer, whose headers are set in place
 * @param schema - The endpoint's metadata, carrying its `.cache()` settings
 * @param forwarded - The headers that went upstream with the call
 * @param request - The request as it reached the proxy
 *
 * @example
 * ```ts
 * applyCacheHeaders(response, schema, middlewareCtx.headers, request);
 * response.headers.get("Cache-Control"); // → "s-maxage=60, stale-while-revalidate"
 * ```
 */
export function applyCacheHeaders(
  response: Response,
  schema: SchemaMetadata,
  forwarded?: Headers,
  request?: Request,
): void {
  if (schema.cache?.revalidate !== undefined) {
    /* Read the request as it arrived: the forwarded set has already dropped
       whatever the allowlist does not carry upstream, so a credential can be
       missing from it while the answer still belongs to one caller. */
    const personal = identifiesCaller(request);
    const varyOn = forwarded ? [...forwarded.keys()].sort() : [];

    response.headers.set(
      "Cache-Control",
      personal
        ? `private, max-age=${schema.cache.revalidate}`
        : `s-maxage=${schema.cache.revalidate}, stale-while-revalidate`,
    );
    if (!personal && varyOn.length > 0) {
      response.headers.set("Vary", varyOn.join(", "));
    }
  }
  if (schema.cache?.tags?.length) {
    response.headers.set("x-courier-tags", schema.cache.tags.join(","));
  }
}
