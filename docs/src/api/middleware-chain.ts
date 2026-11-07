import { authMiddleware, logMiddleware } from "@noverax/courier/middleware"
import { defineMiddleware, isHTTPError } from "@noverax/courier/server"

import { traceLine } from "../site/inspector/server/recorder"

/**
 * The token the chain's auth link sets, made up for the docs: the backend
 * reads no token, and the inspector names the header it travels in,
 * never its value.
 */
export const DEMO_TOKEN = "made-up-docs-token"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * Stamps every answer that is a record with when the server answered:
 * the middleware page's response transformation.
 */
export const stampMiddleware = defineMiddleware("stamp", "after", (_ctx, response) =>
  isRecord(response.data)
    ? { ...response, data: { ...response.data, _meta: { timestamp: new Date().toISOString() } } }
    : response
)

/**
 * Tells the call's trace of a failure — the status an answer came with,
 * or the kind of error, never its headers or body — and passes the
 * failure on to the caller: the middleware page's error handling.
 */
export const failuresMiddleware = defineMiddleware("failures", "wrap", async (ctx, next) => {
  try {
    return await next()
  } catch (error) {
    const kind = isHTTPError(error)
      ? String(error.status)
      : error instanceof Error
        ? error.name
        : "unknown"
    traceLine(
      `[${ctx.source}] ${[ctx.group, ctx.method].filter(Boolean).join(".")} failed: ${kind}`
    )
    throw error
  }
})

/**
 * The middleware example's chain, in the order its page shows it: the log
 * outermost, its lines handed to the inspector rather than the server's
 * own log, then a made-up token in the `Authorization` header, the stamp
 * on the answer, and the link that tells a failure.
 */
export const MIDDLEWARE_CHAIN = [
  logMiddleware({ logger: traceLine }),
  authMiddleware({ getToken: () => DEMO_TOKEN }),
  stampMiddleware,
  failuresMiddleware,
]
