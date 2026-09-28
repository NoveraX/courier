/**
 * Caller request headers every source forwards to its upstream.
 *
 * The headers that claim a client address — `X-Forwarded-For`, `X-Real-IP`,
 * `Forwarded` and the like — are not among them: any page can write them, and
 * copying them let it choose the address an upstream believes. The proxy
 * writes `X-Forwarded-For` itself from the connection (see `forwardedFor`); a
 * source that trusts whoever wrote the caller's copy names it in
 * `allowedHeaders`.
 */
export const ALLOWED_HEADERS = [
  "referer",
  "origin",
  "authorization",
  "user-agent",
  "cookie",
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
 * Never passed back, even by an endpoint or a source that names them.
 *
 * The proxy re-serializes a buffered body and decodes a streamed one, so the
 * upstream's description of its body — its type, length and encoding — would
 * describe bytes that are not the ones sent. The connection-level headers
 * belong to one hop. Cookies travel on their own path, every one of them.
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
