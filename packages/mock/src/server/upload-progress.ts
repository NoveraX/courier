import type { Context as HonoContext } from "hono";

import { callOf } from "./request-call";
import { requestTarget } from "./request-target";
import type { RequestHooks } from "./route-types";

/* How often a body still arriving is reported, and how long it may take before the first report. */
const EVERY_MS = 250;

/**
 * What hears the progress of a request's body, for the hooks: nothing for a
 * body that arrives within a quarter of a second, then a report at most
 * every quarter second while the rest arrives — so a slow upload shows in
 * Studio's log as it comes, and a quick one costs nothing.
 *
 * @param c - The request's context
 * @param hooks - The server's request hooks
 * @param group - The endpoint's group
 * @param endpoint - The endpoint's name
 * @returns What the body reader tells its progress to, or `undefined` when no hook listens
 * @example
 * ```ts
 * readRequestBody(c, { limits, onProgress: uploadReporter(c, config.hooks, group, method) });
 * ```
 */
export function uploadReporter(
  c: HonoContext,
  hooks: RequestHooks | undefined,
  group: string,
  endpoint: string,
): ((received: number, total: number | undefined) => void) | undefined {
  if (!hooks?.onUpload) return undefined;
  const call = callOf(c.req.raw);
  const path = requestTarget(c.req.url);
  let last = call.start;
  return (received, total) => {
    const now = performance.now();
    if (now - last < EVERY_MS) return;
    last = now;
    hooks.onUpload?.(call.id, { httpMethod: c.req.method, path, group, endpoint, received, total });
  };
}
