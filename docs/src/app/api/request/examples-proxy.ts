import type { HandlerConfig } from "@noverax/courier"

import { DEMO_LIMITS, uploadRequestBytes } from "../../../../server/limits"

/**
 * How the site's proxy route serves the live examples' calls.
 *
 * Each caller — the user's address, as the deployment's proxies report it
 * (`COURIER_TRUSTED_PROXIES`) — makes up to 300 calls a minute, and up to
 * 20 of them writes: every call that is not a read, an upload and the
 * encoding example's echo among them. That is more than a reader trying
 * every example at once makes, and a script past it is answered 429 with
 * how long to wait. A body is read only as large as the backend takes it:
 * a call's JSON up to the backend's own limit, an upload up to its largest
 * file with its fields.
 */
export const EXAMPLES_PROXY = {
  rateLimit: {
    requests: 300,
    window: 60_000,
    writes: { requests: 20, window: 60_000 },
  },
  maxBodyBytes: DEMO_LIMITS.bodyBytes,
  maxUploadBytes: uploadRequestBytes(DEMO_LIMITS),
} as const satisfies HandlerConfig
