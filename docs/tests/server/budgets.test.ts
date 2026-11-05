/**
 * The one limit on the examples' backend, where every path to it meets —
 * the proxy route, Server Actions, server-rendered pages. Each call takes
 * from the budget of the address the site's server names, and from the
 * visitor's whose cookie it carries; a write takes from the tighter budget
 * of writes as well. Past any of them, the call is refused with 429 and
 * when to try again; every answer says what is left.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDemoApp } from "../../server/app"
import { DEMO_LIMITS } from "../../server/limits"
import { type Served, serve } from "./serve"

const LIMITS = { ...DEMO_LIMITS, calls: 4, writes: 2 }

let backend: Served

beforeAll(async () => {
  backend = await serve(createDemoApp({ limits: LIMITS, log: () => {} }))
})

afterAll(() => backend.close())

function call(
  method: "GET" | "POST",
  from: { address?: string; visitor?: string } = {}
): Promise<Response> {
  return fetch(`${backend.url}/users`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(from.address !== undefined && { "x-visitor-address": from.address }),
      ...(from.visitor !== undefined && { cookie: `__Host-courier-demo=${from.visitor}` }),
    },
    ...(method === "POST" && {
      body: JSON.stringify({ name: "Jane Doe", email: "jane@example.com" }),
    }),
  })
}

/* The visitor an answer's cookie makes of its caller. */
function visitorOf(answer: Response): string | undefined {
  return /__Host-courier-demo=([\w-]+)/.exec(answer.headers.get("set-cookie") ?? "")?.[1]
}

async function statuses(calls: Array<Promise<Response>>): Promise<number[]> {
  const answers: number[] = []
  for (const answer of calls) answers.push((await answer).status)
  return answers
}

describe("an address's budget", () => {
  it("takes every call, and refuses one past it with 429 and when to try again", async () => {
    const from = { address: "198.51.100.1" }
    for (let read = 0; read < 4; read += 1) expect((await call("GET", from)).status).toBe(200)
    const refused = await call("GET", from)
    expect(refused.status).toBe(429)
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0)
    expect(refused.headers.get("x-ratelimit-remaining")).toBe("0")
    expect(await refused.json()).toEqual({
      success: false,
      code: "RATE_LIMITED",
      message: expect.stringMatching(/^Too many calls from this visitor; try again in \d+ s$/),
    })
  })

  it("holds writes to a tighter budget of their own, which leaves reads alone", async () => {
    const from = { address: "198.51.100.2" }
    expect(await statuses([call("POST", from), call("POST", from), call("POST", from)])).toEqual([
      201, 201, 429,
    ])
    expect((await call("GET", from)).status).toBe(200)
  })

  it("is the address's alone: another is not held back by it", async () => {
    for (let read = 0; read < 5; read += 1) await call("GET", { address: "198.51.100.3" })
    expect((await call("GET", { address: "198.51.100.4" })).status).toBe(200)
  })

  it("is one for an IPv6 /64 network, as a subscriber is given one whole", async () => {
    for (let read = 0; read < 4; read += 1)
      await call("GET", { address: `2001:db8:1:2::${read + 1}` })
    expect((await call("GET", { address: "2001:db8:1:2:ffff:ffff:ffff:9" })).status).toBe(429)
    expect((await call("GET", { address: "2001:db8:1:3::1" })).status).toBe(200)
  })

  it("is one for every call that names no address, or one no address could be", async () => {
    for (let read = 0; read < 4; read += 1) await call("GET")
    expect((await call("GET", { address: "not an address" })).status).toBe(429)
  })
})

describe("a visitor's budget", () => {
  it("follows the visitor from address to address", async () => {
    /* The first write carries no visitor yet: it is the one that makes them. */
    const visitor = visitorOf(await call("POST", { address: "198.51.100.5" }))
    expect(visitor).toBeDefined()
    expect((await call("POST", { address: "198.51.100.6", visitor })).status).toBe(201)
    expect((await call("POST", { address: "198.51.100.7", visitor })).status).toBe(201)
    expect((await call("POST", { address: "198.51.100.8", visitor })).status).toBe(429)
  })
})

describe("every answer", () => {
  it("tells what is left of its tightest budget: of writes, after a write", async () => {
    const read = await call("GET", { address: "198.51.100.9" })
    expect(read.headers.get("x-ratelimit-limit")).toBe("4")
    expect(read.headers.get("x-ratelimit-remaining")).toBe("3")
    expect(Number(read.headers.get("x-ratelimit-reset"))).toBeGreaterThan(0)
    const write = await call("POST", { address: "198.51.100.9" })
    expect(write.headers.get("x-ratelimit-limit")).toBe("2")
    expect(write.headers.get("x-ratelimit-remaining")).toBe("1")
  })

  it("but the health check's, which no budget holds", async () => {
    for (let check = 0; check < 6; check += 1) {
      expect((await fetch(`${backend.url}/health`)).status).toBe(200)
    }
  })
})
