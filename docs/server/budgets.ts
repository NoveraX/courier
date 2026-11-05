import {
  memoryRateLimitStore,
  type RateLimitDecision,
  type RateLimitStore,
  type RateLimitWindow,
} from "@noverax/courier"
import type { RequestHandler, Response } from "express"
import { addressKey } from "./address-key"
import type { DemoLimits } from "./limits"
import { Refusal } from "./refusal"
import { VISITOR_ADDRESS_HEADER } from "./visitor-address"
import { visitorIn } from "./visitor-cookie"

/** One budget a call took from: its size, and what taking came to. */
interface Taken {
  readonly limit: RateLimitWindow
  readonly decision: RateLimitDecision
}

/* Whole seconds, rounded up: a caller that waits as long as it is told is not refused again for it. */
const seconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000))

/**
 * The one limit on the examples' backend, which every path to it meets:
 * the proxy route's calls, Server Actions and the pages rendered on the
 * server alike. Each call takes one from the budget of the address the
 * site's server names, then from the visitor's whose cookie it carries; a
 * write — any call but a read — takes one from their budgets of writes
 * too. A call past a budget is refused with 429 and `Retry-After`, and
 * takes from none after it; every answer says what is left of its
 * tightest budget, in the `X-RateLimit-*` headers Courier's proxy passes
 * on from an API to the page.
 *
 * @param limits - The budgets, as `server/limits.ts` sets them
 * @param store - Where the budgets are kept: Courier's own, in this process
 * @returns The middleware
 * @example
 * ```ts
 * app.use(budgetsFor(DEMO_LIMITS))
 * ```
 */
export function budgetsFor(
  limits: DemoLimits,
  store: RateLimitStore = memoryRateLimitStore()
): RequestHandler {
  const calls = { requests: limits.calls, window: limits.budgetMs }
  const writes = { requests: limits.writes, window: limits.budgetMs }
  const take = async (key: string, limit: RateLimitWindow): Promise<Taken> => ({
    limit,
    decision: await store.take(key, limit),
  })

  return async (req, res, next) => {
    const visitor = visitorIn(req.headers.cookie)
    const owners = [
      `address:${addressKey(req.headers[VISITOR_ADDRESS_HEADER])}`,
      ...(visitor === undefined ? [] : [`visitor:${visitor}`]),
    ]
    const write = req.method !== "GET" && req.method !== "HEAD"
    const taken: Taken[] = []
    for (const owner of owners) {
      if (write) taken.push(await take(`writes:${owner}`, writes))
      taken.push(await take(`calls:${owner}`, calls))
      const refused = taken.find(({ decision }) => !decision.allowed)
      if (refused !== undefined) {
        const wait = seconds(refused.decision.retryAfterMs)
        tell(res, taken)
        res.setHeader("Retry-After", String(wait))
        throw new Refusal(
          429,
          "RATE_LIMITED",
          `Too many calls from this visitor; try again in ${wait} s`
        )
      }
    }
    tell(res, taken)
    next()
  }
}

/* What is left of the budget the call took the most of. */
function tell(res: Response, taken: readonly Taken[]): void {
  const tightest = taken.reduce((least, next) =>
    next.decision.remaining < least.decision.remaining ? next : least
  )
  res.setHeader("X-RateLimit-Limit", String(tightest.limit.requests))
  res.setHeader("X-RateLimit-Remaining", String(tightest.decision.remaining))
  res.setHeader("X-RateLimit-Reset", String(seconds(tightest.decision.resetMs)))
}
