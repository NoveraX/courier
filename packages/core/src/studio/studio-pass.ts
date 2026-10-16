/**
 * The header Studio's Playground sends its one-time pass in, when it calls
 * the app's proxy route from the app's own process in development.
 *
 * The Playground runs a proxy-mode call from the server, so the request
 * carries neither `Origin` nor `Sec-Fetch-Site` and `browsersOnly` would
 * refuse it as it refuses any script. Studio's runtime issues a pass for
 * each call instead, and the proxy lets a request carrying one it redeems
 * past `browsersOnly` — and past nothing else. The proxy takes the header
 * off every request it receives, so Courier's middleware and hooks, an
 * upstream and Studio's events never see it; the framework's own
 * middleware, which runs before the proxy route, does. Where the runtime
 * hands over an incoming request whose headers cannot change, as
 * `Deno.serve` does, the header stays on and its pass is never honoured,
 * and the upstream still never sees it.
 */
export const STUDIO_PASS_HEADER = "x-courier-studio-pass";

/**
 * Where Studio's runtime keeps, on the global object, the function that
 * redeems a pass: `(pass: string) => boolean`, `true` only for a pass it
 * issued, has not seen redeemed, and that has not expired — and from then
 * on, never again for that pass.
 *
 * It is looked up rather than imported, so the proxy does not carry
 * Studio's code: in a process Studio's runtime is not attached to, and in
 * any other process or runtime, nothing redeems a pass.
 */
export const STUDIO_PASS_REDEEMER: symbol = Symbol.for("courier.studioPassRedeemer");

/* 32 random bytes in base64url, unpadded: what a pass is, and nothing else. */
const PASS = /^[A-Za-z0-9_-]{43}$/;

/**
 * Whether a value has the shape of a pass. Anything else is not handed to
 * the redeemer at all.
 *
 * @param value - The header's value
 * @returns `true` for 43 base64url characters
 * @example
 * ```ts
 * isStudioPassShape("not a pass"); // → false
 * ```
 */
export function isStudioPassShape(value: string): boolean {
  return PASS.test(value);
}
