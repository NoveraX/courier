/* A code is an identifier — `ECONNREFUSED`, `UND_ERR_CONNECT_TIMEOUT`,
   `CERT_HAS_EXPIRED`; anything else in its place is not shown as one. */
const IDENTIFIER = /^[A-Za-z][\w.-]{0,63}$/;

/**
 * The code a failure names itself by: what a program reads to tell one
 * failure from another, and what an agent is shown beside its text.
 *
 * @param value - An error, or the data a failure carries
 * @returns Its `code` when that is an identifier, else `undefined`
 * @example
 * ```ts
 * errorCode(Object.assign(new Error("getaddrinfo ENOTFOUND api.example.com"), { code: "ENOTFOUND" })); // "ENOTFOUND"
 * errorCode(new DOMException("The operation was aborted", "AbortError")); // undefined: its code is a number
 * ```
 */
export function errorCode(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null || !("code" in value)) return undefined;
  const { code } = value;
  return typeof code === "string" && IDENTIFIER.test(code) ? code : undefined;
}
