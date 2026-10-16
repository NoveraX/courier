import { BROWSERS_ONLY_REFUSAL } from "@noverax/courier/internal";

/* The code the proxy's 403 names, and a stream's refusal of it. */
const BROWSERS_ONLY = "BROWSERS_ONLY";
const STREAM_FORBIDDEN = 4403;

/**
 * Why `browsersOnly` refused a Playground call it should have let through,
 * and what to do. The runtime sent a one-time pass with the call, and only
 * the runtime of the process serving the route can redeem it: a refusal
 * means the route runs elsewhere — an Edge route, workerd, behind a remote
 * `appOrigin` — or with a Courier core that redeems no pass.
 */
export const BROWSERS_ONLY_ADVICE =
  "browsersOnly refused this call: the app's proxy route did not redeem Studio's one-time pass, " +
  "which only Studio's runtime in the process serving the route can do — not an Edge route, " +
  "workerd, a remote appOrigin or an older Courier core. Run the call in Direct mode, set " +
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
