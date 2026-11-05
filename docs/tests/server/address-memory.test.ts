/**
 * How long the examples' backend keeps a visitor's address, and what the
 * privacy notice says of it. Every budget is kept in one store, Courier's
 * own, which forgets a caller within the shortest window it counts in once
 * their budget is whole again, whether calls come or not: a visitor's
 * address goes at most that window after the longest budget it took from
 * is whole — two minutes after their last call, eleven after their last
 * first change — and the notice names the longest. Time is the test's own
 * clock, never waited for; the store's timer, which runs only while it
 * remembers anyone, tells whether it does.
 */
import { readFileSync } from "node:fs"

import type { NextFunction, Request, Response } from "express"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { budgetsFor } from "../../server/budgets"
import { DEMO_LIMITS } from "../../server/limits"

/* The store sweeps once each shortest window it counts in; a budget is whole a window after its
   last call at most. */
const SWEEP_MS = Math.min(DEMO_LIMITS.budgetMs, DEMO_LIMITS.copiesMs)
const KEPT_MS = Math.max(DEMO_LIMITS.budgetMs, DEMO_LIMITS.copiesMs) + SWEEP_MS

const VISITOR = "198.51.100.7"

/* A call at the backend, from the address the site's server names. */
function from(address: string, method: "GET" | "POST"): Request {
  return { method, headers: { "x-visitor-address": address } } as unknown as Request
}

const answer = { setHeader: () => answer } as unknown as Response
const next: NextFunction = () => {}

/* Whether the store remembers anyone: its timer runs while it does. */
const remembers = () => vi.getTimerCount() > 0

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})

afterEach(() => {
  vi.useRealTimers()
})

/* Another visitor's call first, which sets the store's sweep going: the visitor's own calls then
   come just after one, so that their budgets are whole just after a sweep, as late as can be. */
async function budgetsAfterAnotherVisitor(): Promise<ReturnType<typeof budgetsFor>> {
  const budgets = budgetsFor(DEMO_LIMITS)
  await budgets.calls(from("198.51.100.200", "GET"), answer, next)
  vi.advanceTimersByTime(1)
  return budgets
}

describe("a visitor's address", () => {
  it("is kept while their budget of calls fills again, and forgotten two minutes after their last call", async () => {
    const budgets = await budgetsAfterAnotherVisitor()
    const last = Date.now()
    for (let call = 0; call < DEMO_LIMITS.calls; call += 1) {
      await budgets.calls(from(VISITOR, "GET"), answer, next)
    }

    vi.advanceTimersByTime(DEMO_LIMITS.budgetMs)
    expect(remembers()).toBe(true)
    vi.advanceTimersByTime(SWEEP_MS)
    expect(remembers()).toBe(false)
    expect(Date.now() - last).toBe(2 * 60_000)
  })

  it("is kept while their network's copies fill again, and forgotten eleven minutes after their last first change", async () => {
    const budgets = await budgetsAfterAnotherVisitor()
    const last = Date.now()
    for (let change = 0; change < DEMO_LIMITS.copies; change += 1) {
      await budgets.calls(from(VISITOR, "POST"), answer, next)
      await budgets.copy(from(VISITOR, "POST"))
    }

    vi.advanceTimersByTime(DEMO_LIMITS.copiesMs)
    expect(remembers()).toBe(true)
    vi.advanceTimersByTime(SWEEP_MS)
    expect(remembers()).toBe(false)
    expect(Date.now() - last).toBe(KEPT_MS)
    expect(KEPT_MS).toBe(11 * 60_000)
  })
})

describe("the privacy notice", () => {
  it("says how long the site's server keeps a visitor's address, where it says what it collects and how long", () => {
    const notice = readFileSync(
      new URL("../../src/content/legal/privacy.mdx", import.meta.url),
      "utf8"
    )
    const minutes = `${KEPT_MS / 60_000} minutes`
    const [collects = "", howLong = ""] = notice.split("## How long")
    expect(collects).toContain(`for up to ${minutes} after your last call`)
    expect(howLong.split("## Where")[0]).toContain(`for up to ${minutes} after your last call`)
  })
})
