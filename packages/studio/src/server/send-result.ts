import type { JsonResponse } from "./route-types";

/**
 * Answer with what a route's handler returned: a refusal it chose itself —
 * `{ error, status }`, such as a 404 for an import the config does not
 * declare — gets that status and `{ error }`; anything else is sent as it is.
 *
 * @param res - The route's response
 * @param result - What the handler returned
 *
 * @example
 * ```ts
 * sendResult(res, handleInventory(body, imports)); // → 404 { error } for an unknown import
 * ```
 */
export function sendResult(res: JsonResponse, result: object): void {
  if ("error" in result && "status" in result && typeof result.status === "number") {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json(result);
}
