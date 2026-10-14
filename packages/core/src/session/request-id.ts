/** The header a request's id travels in unless `requestId` names another. */
export const REQUEST_ID_HEADER = "x-request-id";

/* One word of visible characters but quotes and backslashes, which a log line escapes: what the
   ids proxies and platforms write are made of — nginx's hex, UUIDs, Kong's `uuid#n`, AWS's and
   Google Cloud's trace ids with their `;` and `=`. */
const REQUEST_ID = /^[\x21\x23-\x5b\x5d-\x7e]{1,200}$/;

/**
 * Whether a header value is a request id: one word of at most 200 visible
 * characters, none of them a quote or a backslash — every id a proxy or a
 * platform writes, from nginx's hex to AWS's `Root=1-…;Parent=…;Sampled=1`.
 *
 * @param value - The header's value
 * @returns `true` for a well-formed id
 * @example
 * ```ts
 * isRequestId("3f0c2a4e-8b1d-4c7a-9e2f-6a1b5c3d7e90#12"); // → true
 * isRequestId("a b"); // → false
 * ```
 */
export function isRequestId(value: string): boolean {
  return REQUEST_ID.test(value);
}
