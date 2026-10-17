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

/* The requests a pass let through: what Studio marks, and nothing that only names their id. */
const admitted = new WeakSet<Request>();

/**
 * Redeem the pass a request carried, issued by Studio's runtime in this
 * process. Nothing is honoured outside development, where there is no
 * `process` to say this is development, or where no runtime is attached to
 * redeem it; a malformed pass is not even looked at. Redeeming it spends
 * it, and the request is remembered as let through on it.
 *
 * @param request - The request the pass came with
 * @param pass - The pass it carried, if any
 * @returns `true` only for a pass the runtime issued and had not yet seen redeemed
 * @example
 * ```ts
 * if (config.browsersOnly && !sentByBrowser(request) && !redeemStudioPass(request, pass)) return refuse();
 * ```
 */
export function redeemStudioPass(request: Request, pass: string | undefined): boolean {
  if (pass === undefined || !isDevelopment() || !isStudioPassShape(pass)) return false;
  const redeem: unknown = Reflect.get(globalThis, STUDIO_PASS_REDEEMER);
  if (typeof redeem !== "function" || Reflect.apply(redeem, undefined, [pass]) !== true) {
    return false;
  }
  admitted.add(request);
  return true;
}

/**
 * Whether `browsersOnly` let this very request through on Studio's pass —
 * as its Studio events say, so another request that names the same Studio
 * request id is never taken for it.
 *
 * @param request - The request the proxy is serving, if any
 * @returns `true` when its own pass was redeemed
 * @example
 * ```ts
 * dt.onStreamOpen?.({ ...open, ...(admittedOnStudioPass(request) && { studioPass: true }) });
 * ```
 */
export function admittedOnStudioPass(request: Request | undefined): boolean {
  return request !== undefined && admitted.has(request);
}
