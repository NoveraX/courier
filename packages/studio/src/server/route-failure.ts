import { createLogger } from "@noverax/courier";
import { errMsg } from "./fs-helpers";
import { ProjectUnavailableError } from "./project-state/project-unavailable-error";
import type { JsonResponse } from "./route-types";

const log = createLogger("Studio");

/**
 * Answer a route that failed.
 *
 * A request Studio will not serve from the project it runs right now gets
 * that error's status, 503 or 409, with `{ error, code }`, so the UI can say
 * what to do. Anything else is Studio's own failure: it is logged and
 * answered 500 with its message, or `fallback` when it carries none.
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
  if (err instanceof ProjectUnavailableError) {
    res.status(err.httpStatus).json({ error: err.message, code: err.code });
    return;
  }
  log.warn(fallback, err);
  res.status(500).json({ error: errMsg(err, fallback) });
}
