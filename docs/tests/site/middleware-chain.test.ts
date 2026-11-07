/**
 * The middleware example's chain, as its page shows it: a log whose lines
 * go to the inspector rather than the server's own log, a made-up token
 * set in a header, a stamp on every answer, and a link that tells a
 * failure and passes it on. Outside a call the inspector traces, the lines
 * go nowhere.
 */

import type { MiddlewareContext, MiddlewareResponse } from "@noverax/courier/server"
import { HTTPError } from "@noverax/courier/server"
import { describe, expect, it } from "vitest"

import { failuresMiddleware, MIDDLEWARE_CHAIN, stampMiddleware } from "@/api/middleware-chain"
import { withCallLog } from "@/site/inspector/server/recorder"

const context = { source: "middlewareApi", group: "users", method: "getAll" } as MiddlewareContext
const answer = (data: unknown): MiddlewareResponse => ({
  status: 200,
  headers: new Headers(),
  data,
})

describe("the middleware example's chain", () => {
  it("runs in the order the page shows it", () => {
    expect(MIDDLEWARE_CHAIN.map((link) => [link.name, link.phase])).toEqual([
      ["log", "wrap"],
      ["auth", "wrap"],
      ["stamp", "after"],
      ["failures", "wrap"],
    ])
  })

  it("stamps an answer that is a record, and leaves any other as it came", async () => {
    const stamp = stampMiddleware
    if (stamp.phase !== "after") throw new Error("the stamp runs after the request")
    const stamped = await stamp.handler(context, answer({ total: 3 }))
    expect(stamped.data).toEqual({ total: 3, _meta: { timestamp: expect.any(String) } })
    const list = await stamp.handler(context, answer([1, 2]))
    expect(list.data).toEqual([1, 2])
  })

  it("tells the trace of a failure, its status alone, and passes the failure on", async () => {
    const failures = failuresMiddleware
    if (failures.phase !== "wrap") throw new Error("the failures link wraps the request")
    const failure = new HTTPError({ status: 500, headers: new Headers(), data: { secret: "x" } })
    const { value, log } = await withCallLog(() =>
      failures.handler(context, () => Promise.reject(failure)).catch((error: unknown) => error)
    )
    expect(value).toBe(failure)
    expect(log.lines).toEqual(["[middlewareApi] users.getAll failed: 500"])
  })

  it("writes nothing anywhere for a failure outside a traced call", async () => {
    const failures = failuresMiddleware
    if (failures.phase !== "wrap") throw new Error("the failures link wraps the request")
    const failure = new Error("down")
    await expect(failures.handler(context, () => Promise.reject(failure))).rejects.toBe(failure)
  })
})
