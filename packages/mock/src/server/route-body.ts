import type { Context as HonoContext } from "hono";

import { BODY_LIMITS } from "./body-limits";
import { type RequestBody, readRequestBody } from "./read-request-body";
import { faultOf } from "./request-call";
import { resolveNetConfig } from "./route-network";
import type { RouteConfig } from "./route-types";
import { uploadReporter } from "./upload-progress";

/**
 * Read the body of a call to `group.method` under the conditions its route
 * is answered with: the mock's limits, the route's upload speed, size limit
 * and types, and the fault decided for the request — an `interrupt` cuts
 * the body off halfway. The hooks hear the progress of a slow body.
 *
 * @param c - The request's context
 * @param config - The route config
 * @param group - The endpoint's group
 * @param method - The endpoint's name
 * @returns The body, or why it was not taken
 * @example
 * ```ts
 * const body = await readRouteBody(c, config, "files", "upload");
 * if ("error" in body) return refuseRequest(c, "files", "upload", body, config);
 * ```
 */
export function readRouteBody(
  c: HonoContext,
  config: RouteConfig,
  group: string,
  method: string,
): Promise<RequestBody> {
  const network = resolveNetConfig(config, group, method);
  return readRequestBody(c, {
    limits: config.bodyLimits ?? BODY_LIMITS,
    uploads: network?.uploads,
    interrupt: faultOf(c.req.raw, network) === "interrupt",
    onProgress: uploadReporter(c, config.hooks, group, method),
  });
}
