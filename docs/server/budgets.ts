import {
  memoryRateLimitStore,
  type RateLimitDecision,
  type RateLimitStore,
  type RateLimitWindow,
} from "@noverax/courier"
import type { Request, RequestHandler, Response } from "express"
import { addressKey } from "./address-key"
import type { DemoLimits } from "./limits"
import { Refusal, wholeSeconds } from "./refusal"
import { VISITOR_ADDRESS_HEADER } from "./visitor-address"
import { visitorIn } from "./visitor-cookie"

/** One budget a call took from: its size, and what taking came to. */
interface Taken {
  readonly limit: RateLimitWindow
  readonly decision: RateLimitDecision
}

/** The budgets of the examples' backend: every call's, and a new visitor's copy's. */
export interface Budgets {
  /** The middleware every route is behind, which takes each call from its budgets. */
  readonly calls: RequestHandler
  /**
   * Take a visitor's first change — which makes them a copy of the first
   * data — from the copies of the network it comes from.
   *
   * @param req - The call
   * @throws Refusal 429 `RATE_LIMITED`, with when to try again, past the network's copies
   */
  copy(req: Request): Promise<void>
}

/**
 * The one limit on the examples' backend, which every path to it meets:
 * the proxy route's calls, Server Actions and the pages rendered on the
 * server alike. Each call takes one from the budget of the address the
 * site's server names, then from the visitor's whose cookie it carries; a
 * write — any call but a read — takes one from their budgets of writes
 * too. A call past a budget is refused with 429 and `Retry-After`, and
 * takes from none after it; every answer says what is left of its
 * tightest budget, in the `X-RateLimit-*` headers Courier's proxy passes
 * on from an API to the page. A visitor's first change takes one more,
 * from the copies of their network, wider than an address: a visitor
 * makes one copy, and a script that makes copy after copy to crowd the
 * others out of the store is held back by it.
 *
 * @param limits - The budgets, as `server/limits.ts` sets them
 * @param store - Where the budgets are kept: Courier's own, in this process
 * @returns The budgets
 * @example
 * ```ts
 * const budgets = budgetsFor(DEMO_LIMITS)
 * app.use(budgets.calls)
 * ```
 */
export function budgetsFor(
  limits: DemoLimits,
  store: RateLimitStore = memoryRateLimitStore()
): Budgets {
  const calls = { requests: limits.calls, window: limits.budgetMs }
  const writes = { requests: limits.writes, window: limits.budgetMs }
  const copies = { requests: limits.copies, window: limits.copiesMs }
  const take = async (key: string, limit: RateLimitWindow): Promise<Taken> => ({
    limit,
    decision: await store.take(key, limit),
  })

  return {
    async calls(req, res, next) {
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
          const wait = wholeSeconds(refused.decision.retryAfterMs)
          tell(res, taken)
          throw new Refusal(
            429,
            "RATE_LIMITED",
            `Too many calls from this visitor; try again in ${wait} s`,
            wait
          )
        }
      }
      tell(res, taken)
      next()
    },

    async copy(req) {
      const network = addressKey(req.headers[VISITOR_ADDRESS_HEADER], 48)
      const { decision } = await take(`copies:network:${network}`, copies)
      if (decision.allowed) return
      const wait = wholeSeconds(decision.retryAfterMs)
      throw new Refusal(
        429,
        "RATE_LIMITED",
        `Too many new visitors from this network; try again in ${wait} s`,
        wait
      )
    },
  }
}

/* What is left of the budget the call took the most of. */
function tell(res: Response, taken: readonly Taken[]): void {
  const tightest = taken.reduce((least, next) =>
    next.decision.remaining < least.decision.remaining ? next : least
  )
  res.setHeader("X-RateLimit-Limit", String(tightest.limit.requests))
  res.setHeader("X-RateLimit-Remaining", String(tightest.decision.remaining))
  res.setHeader("X-RateLimit-Reset", String(wholeSeconds(tightest.decision.resetMs)))
}
