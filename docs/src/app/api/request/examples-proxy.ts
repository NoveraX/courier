import type { HandlerConfig } from "@noverax/courier/server"

import { DEMO_LIMITS, type DemoLimits, uploadRequestBytes } from "../../../../server/limits"

/**
 * How the site's proxy route serves the live examples' calls: it reads a
 * call's JSON only as large as the backend takes it, and holds none of an
 * upload — past its options, the upload is sent on to the backend as it
 * arrives, up to the largest file the example takes with its fields. The
 * backend then counts an upload against its caller's budget before its
 * file comes, and an upload still being sent holds only its pieces in
 * flight. A body, sent on or read, has to arrive within the backend's
 * window for a call: the route gives up on it sooner, and answers why.
 * Each caller's budget is not the route's to keep: the backend keeps it,
 * where the route's calls meet the Server Actions' and the pages' own
 * (`server/budgets.ts`), and the route passes its refusals on.
 *
 * @param limits - The backend's limits
 * @returns The route's settings
 * @example
 * ```ts
 * apiRoute(examplesProxy(DEMO_LIMITS))
 * ```
 */
export function examplesProxy(limits: DemoLimits) {
  return {
    maxBodyBytes: limits.bodyBytes,
    maxUploadBytes: uploadRequestBytes(limits),
    uploadMode: "stream",
    bodyTimeoutMs: limits.bodyMs,
    bodyIdleTimeoutMs: limits.bodyIdleMs,
  } as const satisfies HandlerConfig
}

/** The route's settings, for the limits the examples' backend runs with. */
export const EXAMPLES_PROXY = examplesProxy(DEMO_LIMITS)
