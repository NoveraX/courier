/**
 * Whether the platform's `fetch` keeps a copy of a form or a `Blob` it is
 * given as a request's body, whole, for as long as it sends it.
 *
 * Node's `fetch` is undici, which takes the Fetch standard's step of
 * cloning each request it may have to send again — after a redirect — and
 * a clone tees the body's stream: one branch is sent, the other kept until
 * the request ends. A 100 MB upload held 200 MB more while it went out.
 * Undici 8 leaves the clone out for a body it could not send again, a
 * stream, as the standard allows; a body it can re-read, it still copies.
 * Every other runtime's `fetch` reads such a body as it sends it.
 *
 * @example
 * ```ts
 * if (FETCH_KEEPS_FORMS && body instanceof FormData) return sendAsStream(url, init, (s) => s);
 * ```
 */
export const FETCH_KEEPS_FORMS: boolean =
  typeof process !== "undefined" && typeof process.versions?.undici === "string";
