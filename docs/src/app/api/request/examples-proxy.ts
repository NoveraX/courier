import type { HandlerConfig } from "@noverax/courier"

import { DEMO_LIMITS, uploadRequestBytes } from "../../../../server/limits"

/**
 * How the site's proxy route serves the live examples' calls: it reads a
 * call's JSON only as large as the backend takes it, and holds none of an
 * upload — past its options, the upload is sent on to the backend as it
 * arrives, up to the largest file the example takes with its fields. The
 * backend then counts an upload against its caller's budget before its
 * file comes, and an upload still being sent holds only its pieces in
 * flight. Each caller's budget is not the route's to keep: the backend
 * keeps it, where the route's calls meet the Server Actions' and the
 * pages' own (`server/budgets.ts`), and the route passes its refusals on.
 */
export const EXAMPLES_PROXY = {
  maxBodyBytes: DEMO_LIMITS.bodyBytes,
  maxUploadBytes: uploadRequestBytes(DEMO_LIMITS),
  uploadMode: "stream",
} as const satisfies HandlerConfig
