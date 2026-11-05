import type { HandlerConfig } from "@noverax/courier"

import { DEMO_LIMITS, uploadRequestBytes } from "../../../../server/limits"

/**
 * How the site's proxy route serves the live examples' calls: it reads a
 * body only as large as the backend takes it — a call's JSON up to the
 * backend's own limit, an upload up to its largest file with its fields.
 * Each caller's budget is not the route's to keep: the backend keeps it,
 * where the route's calls meet the Server Actions' and the pages' own
 * (`server/budgets.ts`), and the route passes its refusals on.
 */
export const EXAMPLES_PROXY = {
  maxBodyBytes: DEMO_LIMITS.bodyBytes,
  maxUploadBytes: uploadRequestBytes(DEMO_LIMITS),
} as const satisfies HandlerConfig
