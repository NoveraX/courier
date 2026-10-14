import { isRecord } from "@noverax/courier-cli/devkit";
import type { JsonResponse } from "./route-types";

/**
 * A route's response that also hands each error it answers to `failed`:
 * an update check that fails is remembered as the import's check, whatever
 * answers it.
 *
 * @param res - The route's response
 * @param failed - Told the `error` of each answer of 400 or more
 * @returns The response to answer through
 * @example
 * ```ts
 * const answer = checkedResponse(res, (error) => remember({ error }));
 * sendRouteFailure(answer, err, "Failed to check updates");
 * ```
 */
export function checkedResponse(res: JsonResponse, failed: (error: string) => void): JsonResponse {
  let status = 200;
  const checked: JsonResponse = {
    status(code) {
      status = code;
      res.status(code);
      return checked;
    },
    json(data) {
      if (status >= 400 && isRecord(data) && typeof data.error === "string") failed(data.error);
      res.json(data);
    },
  };
  return checked;
}
