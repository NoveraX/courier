import type { ErrorRequestHandler, RequestHandler } from "express"

import { isRecord } from "./fields"
import { Refusal } from "./refusal"
import type { RefusalLog } from "./refusal-log"

/* A route named in a refusal is cut short: a page chose it, and it can be long. */
const NAMED_PATH = 120

/**
 * Answer a call to a route the backend does not have: 404
 * `ROUTE_NOT_FOUND`, naming it, in JSON as every other refusal.
 *
 * @example
 * ```ts
 * app.use(noSuchRoute)
 * ```
 */
export const noSuchRoute: RequestHandler = (req) => {
  throw new Refusal(
    404,
    "ROUTE_NOT_FOUND",
    `The backend has no route ${req.method} ${req.path.slice(0, NAMED_PATH)}`
  )
}

/**
 * Answer what stopped a call, always in JSON, as
 * `{ success: false, message, code }`: a refusal with its own status, a
 * body the parsers could not read as the refusal it is, and anything else
 * as 500 `INTERNAL`, whose details go to the log alone. A refusal is
 * expected and logs one line; a failure logs its stack.
 *
 * @param log - Where refusals are counted
 * @param bodyBytes - The largest body the backend reads, named when one is larger
 * @returns The handler
 * @example
 * ```ts
 * app.use(answerFailures(refusalLog(), DEMO_LIMITS.bodyBytes))
 * ```
 */
export function answerFailures(log: RefusalLog, bodyBytes: number): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    /* An answer already on its way can only be cut off, which Express does. */
    if (res.headersSent) return next(error)
    const refusal = refusalOf(error, bodyBytes)
    if (refusal !== undefined) {
      log(refusal.code)
      res
        .status(refusal.status)
        .json({ success: false, message: refusal.message, code: refusal.code })
      return
    }
    console.error(`The examples' backend failed to answer ${req.method} ${req.path}`, error)
    res
      .status(500)
      .json({ success: false, message: "The backend failed to answer", code: "INTERNAL" })
  }
}

/* The body parsers fail as http-errors writes an error: a status under 500, a message meant for
   the caller, and the kind of failure in `type`. */
function refusalOf(error: unknown, bodyBytes: number): Refusal | undefined {
  if (error instanceof Refusal) return error
  if (!isRecord(error) || error.expose !== true || typeof error.status !== "number")
    return undefined
  if (error.status < 400 || error.status > 499) return undefined
  switch (error.type) {
    case "entity.too.large":
      return new Refusal(
        413,
        "BODY_TOO_LARGE",
        `The body is larger than the ${bodyBytes / 1024} KiB the backend reads`
      )
    case "parameters.too.many":
      return new Refusal(413, "BODY_TOO_LARGE", "The form has more fields than the backend reads")
    case "entity.parse.failed":
      return new Refusal(400, "INVALID_BODY", "The body is not valid JSON")
    default:
      return new Refusal(error.status, "INVALID_BODY", "The backend cannot read the body")
  }
}
