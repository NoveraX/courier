import { CourierError, createLogger } from "@noverax/courier";
import { errMsg } from "./fs-helpers";
import type { JsonResponse } from "./route-types";

const log = createLogger("Studio");

/**
 * Answer a route that failed.
 *
 * An error that names the status a request deserves — the project Studio
 * runs cannot serve it right now (503), a private spec host it cannot tell
 * the project allows (409), a path outside the project or an import
 * declaration it refuses (400) — is answered with that status and
 * `{ error, code }`, so the UI can say what to do. Anything else is Studio's
 * own failure: it is logged and answered 500 with its message, or
 * `fallback` when it carries none.
 *
 * @param res - The route's response
 * @param err - What the route threw
 * @param fallback - What failed, for an error that carries no message
 *
 * @example
 * ```ts
 * try {
 *   res.json(await list());
 * } catch (err) {
 *   sendRouteFailure(res, err, "Failed to list imports");
 * }
 * ```
 */
export function sendRouteFailure(res: JsonResponse, err: unknown, fallback: string): void {
  const status = answeredStatus(err);
  if (err instanceof CourierError && status !== undefined) {
    /* A refused file plan carries the plan as it stands, for the UI to show. */
    const plan = "plan" in err && err.plan !== undefined ? { plan: err.plan } : {};
    res.status(status).json({ error: err.message, code: err.code, ...plan });
    return;
  }
  log.warn(fallback, err);
  res.status(500).json({ error: errMsg(err, fallback) });
}

function answeredStatus(err: unknown): number | undefined {
  if (!(err instanceof CourierError) || !("httpStatus" in err)) return undefined;
  const status = err.httpStatus;
  return typeof status === "number" && status >= 400 && status < 600 ? status : undefined;
}
