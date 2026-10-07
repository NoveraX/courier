/**
 * Caller request headers every source forwards to its upstream.
 *
 * The headers that claim a client address — `X-Forwarded-For`, `X-Real-IP`,
 * `Forwarded` and the like — are not among them: any page can write them, and
 * copying them let it choose the address an upstream believes. The proxy
 * writes `X-Forwarded-For` itself from the connection (see `forwardedFor`); a
 * source that trusts whoever wrote the caller's copy names it in
 * `allowedHeaders`.
 *
 * `Cookie` is not among them either. The browser sends every cookie of the
 * application's origin, its own session included, and forwarded by default
 * they reached whatever upstream a source points at — a third party's too.
 * A source, a base or an endpoint that owns the session names `cookie`.
 *
 * `Authorization` is, for the token a script sets — `Bearer`, or a scheme of
 * the API's own. The credentials a browser sends by itself, in `Basic`,
 * `Digest`, `Negotiate` or `NTLM`, answer the application's own login
 * prompt, and go on only where a source or an endpoint names
 * `authorization` (see `keepBrowserCredentials`).
 */
export const ALLOWED_HEADERS = [
  "referer",
  "origin",
  "authorization",
  "user-agent",
  "x-request-id",
] as const;

/**
 * Upstream response headers the proxy passes back to the browser.
 *
 * The list above travels the other way — it says which of the caller's headers
 * may reach the upstream — and applying it to a response drops everything that
 * describes the answer while keeping nothing useful. These describe the answer
 * and survive the proxy re-serializing the body as JSON.
 */
export const RESPONSE_HEADERS = [
  "age",
  "cache-control",
  "content-disposition",
  "content-language",
  "etag",
  "expires",
  "last-modified",
  "retry-after",
  "vary",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "x-request-id",
] as const;

/**
 * Additionally passed back when the upstream body travels through untouched.
 *
 * A buffered response is re-serialized, so the upstream's own content type
 * would describe a body that no longer exists. A streamed one keeps the
 * upstream's content type — but not its encoding: `fetch` has already
 * decompressed the body, so repeating `content-encoding: gzip` made the
 * browser try to decompress plain bytes and fail.
 */
export const STREAMED_RESPONSE_HEADERS = ["content-type"] as const;

/**
 * Never passed back through the header allowlist, even by an endpoint or a
 * source that names them.
 *
 * The proxy re-serializes a buffered body and decodes a streamed one, so the
 * upstream's description of its body — its type, length and encoding — would
 * describe bytes that are not the ones sent. The connection-level headers
 * belong to one hop. `Set-Cookie` travels on a path of its own, where each
 * cookie stays a value of its own, and only for an endpoint that names it.
 */
export const NEVER_PASSED_RESPONSE_HEADERS: ReadonlySet<string> = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "content-type",
  "keep-alive",
  "proxy-authenticate",
  "set-cookie",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
