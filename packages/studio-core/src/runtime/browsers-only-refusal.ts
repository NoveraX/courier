import { BROWSERS_ONLY_REFUSAL } from "@noverax/courier/internal";

/* The code the proxy's 403 names, and a stream's refusal of it. */
const BROWSERS_ONLY = "BROWSERS_ONLY";
const STREAM_FORBIDDEN = 4403;

/**
 * Why `browsersOnly` refused a Playground call it should have let through,
 * and what to do. The runtime sent a one-time pass with the call, and the
 * route did not redeem it: the route runs where the runtime is not — an
 * Edge route, workerd, behind a remote `appOrigin` — or where it may not
 * take the pass off the request, as under `Deno.serve`; or the pass did not
 * arrive whole and in time — a proxy
 * in front of the route took the header off, the route was reached more
 * than 30 seconds later, as while it compiles on first request, more than
 * 256 calls were waiting for theirs, or the call reached the route twice.
 */
export const BROWSERS_ONLY_ADVICE =
  "browsersOnly refused this call: the app's proxy route did not redeem Studio's one-time pass. " +
  "Only Studio's runtime in the process serving the route can, in development, on a request it " +
  "may take the pass off — not an Edge route, workerd, Deno.serve or a remote appOrigin — and " +
  "only a pass that arrives " +
  "whole and in time: not one a proxy in front of the route took off, one that reached the route " +
  "after 30 seconds (as while it compiles on first request), one pushed out by more than 256 calls " +
  "in flight, or one already spent. Send the call again, run it in Direct mode, set " +
  'browsersOnly: process.env.NODE_ENV === "production", or serve the route on the Node runtime.';

/**
 * Whether an HTTP answer is the proxy's `browsersOnly` refusal.
 *
 * @param status - The answer's status
 * @param data - Its body
 * @returns `true` for a 403 naming `BROWSERS_ONLY`
 * @example
 * ```ts
 * isBrowsersOnlyRefusal(403, { code: "BROWSERS_ONLY" }); // → true
 * ```
 */
export function isBrowsersOnlyRefusal(status: number, data: unknown): boolean {
  if (status !== 403 || typeof data !== "object" || data === null) return false;
  return Reflect.get(data, "code") === BROWSERS_ONLY;
}

/**
 * Whether a stream failed on the proxy's `browsersOnly` refusal: refused
 * with 403, and with the refusal's own words, which tell it from a
 * connection hook's.
 *
 * @param error - What the stream failed with
 * @returns `true` for the refusal
 * @example
 * ```ts
 * const message = isBrowsersOnlyStreamRefusal(err) ? BROWSERS_ONLY_ADVICE : String(err);
 * ```
 */
export function isBrowsersOnlyStreamRefusal(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return Reflect.get(error, "code") === STREAM_FORBIDDEN && error.message === BROWSERS_ONLY_REFUSAL;
}
