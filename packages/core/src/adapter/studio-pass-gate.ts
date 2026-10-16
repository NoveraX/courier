import { isStudioPassShape, STUDIO_PASS_HEADER, STUDIO_PASS_REDEEMER } from "../studio/studio-pass";
import { isDevelopment } from "../utils/development";

/**
 * Take Studio's pass off a request, so nothing past the proxy's gate — the
 * upstream, a middleware, a hook, Studio's own events — ever sees it.
 *
 * A request whose headers cannot be changed, as some runtimes hand them
 * over, keeps the header; its pass is then not given back, so it is never
 * redeemed for a request that would carry it further.
 *
 * @param request - The request the proxy received
 * @returns The pass, when the request carried one and it was taken off
 * @example
 * ```ts
 * const pass = takeStudioPass(request);
 * ```
 */
export function takeStudioPass(request: Request): string | undefined {
  const pass = request.headers.get(STUDIO_PASS_HEADER);
  if (pass === null) return undefined;
  return removed(request.headers) ? pass : undefined;
}

/* Immutable headers throw on delete: the recovery is to leave the pass unused. */
function removed(headers: Headers): boolean {
  try {
    headers.delete(STUDIO_PASS_HEADER);
  } catch {
    return false;
  }
  return !headers.has(STUDIO_PASS_HEADER);
}

/**
 * Redeem the pass a request carried, issued by Studio's runtime in this
 * process. Nothing is honoured outside development, where there is no
 * `process` to say this is development, or where no runtime is attached to
 * redeem it; a malformed pass is not even looked at. Redeeming it spends
 * it.
 *
 * @param pass - The pass the request carried, if any
 * @returns `true` only for a pass the runtime issued and had not yet seen redeemed
 * @example
 * ```ts
 * if (config.browsersOnly && !sentByBrowser(request) && !redeemStudioPass(pass)) return refuse();
 * ```
 */
export function redeemStudioPass(pass: string | undefined): boolean {
  if (pass === undefined || !isDevelopment() || !isStudioPassShape(pass)) return false;
  const redeem: unknown = Reflect.get(globalThis, STUDIO_PASS_REDEEMER);
  return typeof redeem === "function" && Reflect.apply(redeem, undefined, [pass]) === true;
}
