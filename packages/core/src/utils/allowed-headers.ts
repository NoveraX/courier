export const ALLOWED_HEADERS = [
  "referer",
  "origin",
  "authorization",
  "user-agent",
  "cookie",
  "forwarded-for",
  "forwarded",
  "x-client-ip",
  "x-cluster-client-ip",
  "x-forwarded-for",
  "x-forwarded",
  "x-real-ip",
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
 * A buffered response is re-serialized, so the upstream's own content type and
 * encoding would describe a body that no longer exists. A streamed one is the
 * upstream's bytes, and the browser needs them to read it.
 */
export const STREAMED_RESPONSE_HEADERS = ["content-type", "content-encoding"] as const;
