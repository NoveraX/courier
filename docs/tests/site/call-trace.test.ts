/**
 * What the site's server keeps of one call while it serves it, and the
 * trace it makes of that: names of headers and of cookies, never their
 * values; the API's path, never its address; each request to the API in
 * order, each middleware in the order it ran — no more of any of them
 * than its limit, and a count of what was left out.
 */
import { describe, expect, it } from "vitest"

import { CallLog } from "@/site/inspector/server/call-log"
import { proxyTraceOf, serverTraceOf } from "@/site/inspector/server/trace-of"
import { formatServerTiming } from "@/site/inspector/server-timing"
import { traceMetrics } from "@/site/inspector/trace-metrics"

/* Values no trace may hold: the visitor's cookie and address, a token, the API's own address. */
const COOKIE = "s3cr3t-cookie-value"
const ADDRESS = "198.51.100.77"
const TOKEN = "made-up-token-4711"
const API = "http://127.0.0.1:4000"

function served(log: CallLog) {
  log.fetchStarted("POST", `${API}/users?sig=${TOKEN}`)
  log.fetchEnded(201)
  log.answered(
    {
      cookie: `__Host-courier-demo=${COOKIE}; consent=1`,
      authorization: `Bearer ${TOKEN}`,
      origin: "https://courier.test",
      "x-forwarded-for": ADDRESS,
      "x-visitor-address": ADDRESS,
    },
    {
      "content-type": "application/json; charset=utf-8",
      "set-cookie": `__Host-courier-demo=${COOKIE}; Path=/; Secure, other=1; Expires=Wed, 21 Oct 2026 07:28:00 GMT`,
    }
  )
}

const request = () =>
  new Request("https://courier.test/api/request?_s=api&_g=users&_m=create", {
    method: "POST",
    headers: {
      cookie: `__Host-courier-demo=${COOKIE}`,
      "content-type": "application/json",
      "content-length": "86",
      "x-forwarded-for": ADDRESS,
    },
  })

describe("a proxied call's trace", () => {
  it("names the headers and the cookies each way, and holds none of their values", () => {
    const log = new CallLog(() => 0)
    log.parsed({ name: "Jane Doe", password: TOKEN })
    served(log)
    const answer = new Response(null, {
      status: 201,
      headers: { "set-cookie": `__Host-courier-demo=${COOKIE}`, "x-courier-rid": "req_a_1" },
    })
    const trace = proxyTraceOf(log, request(), answer)
    expect(trace.received).toEqual({
      method: "POST",
      target: "/api/request?_s=api&_g=users&_m=create",
      headers: ["content-length", "content-type", "cookie(__Host-courier-demo)", "x-forwarded-for"],
      body: "application/json 86",
    })
    expect(trace.sent).toEqual([
      "authorization",
      "cookie(__Host-courier-demo,consent)",
      "origin",
      "x-forwarded-for",
      "x-visitor-address",
    ])
    expect(trace.answered).toEqual(["content-type", "set-cookie(__Host-courier-demo,other)"])
    expect(trace.passedBack).toEqual(["set-cookie(__Host-courier-demo)", "x-courier-rid"])
    expect(trace.rid).toBe("req_a_1")
    expect(trace.status).toBe(201)
    const everything = `${JSON.stringify(trace)} ${formatServerTiming(traceMetrics(trace))}`
    for (const secret of [COOKIE, ADDRESS, TOKEN, "127.0.0.1", ":4000"]) {
      expect(everything).not.toContain(secret)
    }
  })

  it("shows the API's path and query, not its address, and the variables with secrets masked", () => {
    const log = new CallLog(() => 0)
    log.parsed({ name: "Jane Doe", password: TOKEN })
    served(log)
    const trace = proxyTraceOf(log, request(), new Response(null, { status: 201 }))
    expect(trace.attempts).toEqual([
      {
        method: "POST",
        target: expect.stringMatching(/^\/users\?sig=/),
        outcome: "201",
        at: 0,
        ms: 0,
      },
    ])
    expect(trace.variables).toContain('"name":"Jane Doe"')
    expect(trace.variables).not.toContain(TOKEN)
  })

  it("keeps each attempt in order with how it ended, and how the cache took the call", () => {
    let now = 0
    const log = new CallLog(() => now)
    log.fetchStarted("GET", `${API}/error/503`)
    now = 2
    log.fetchFailed(503, "HTTP 503")
    now = 300
    log.fetchStarted("GET", `${API}/slow`)
    now = 700
    log.fetchFailed(undefined, "Request timed out after 400 ms")
    log.fetchStarted("GET", `${API}/slow`)
    log.fetchFailed(undefined, "The call was cancelled")
    log.fetchStarted("GET", `${API}/slow`)
    log.fetchFailed(undefined, "fetch failed")
    log.cache("miss")
    log.cache("store 30000")
    const trace = proxyTraceOf(log, request(), new Response(null, { status: 504 }))
    expect(trace.attempts.map(({ outcome, at, ms }) => ({ outcome, at, ms }))).toEqual([
      { outcome: "503", at: 0, ms: 2 },
      { outcome: "timeout", at: 300, ms: 400 },
      { outcome: "cancelled", at: 700, ms: 0 },
      { outcome: "no-answer", at: 700, ms: 0 },
    ])
    expect(trace.cache).toEqual(["miss", "store 30000"])
  })

  it("keeps the chain in the order it ran, and its lines", () => {
    const log = new CallLog(() => 0)
    log.link("auth", 1, "before", 0.4, ["Authorization"])
    log.link("log", 0, "wrap", 2.5, [])
    log.line("middlewareApi:users:getAll → 200 (5ms)")
    const trace = proxyTraceOf(log, request(), new Response(null))
    expect(trace.chain).toEqual([
      { name: "log", phase: "wrap", ms: 2.5, added: [] },
      { name: "auth", phase: "before", ms: 0.4, added: ["authorization"] },
    ])
    expect(trace.log).toEqual(["middlewareApi:users:getAll → 200 (5ms)"])
  })

  it("keeps no more than its limits, and counts what it left out", () => {
    const log = new CallLog(() => 0)
    for (let attempt = 0; attempt < 10; attempt += 1) {
      log.fetchStarted("GET", `${API}/error/503`)
      log.fetchFailed(503, "HTTP 503")
    }
    for (let line = 0; line < 10; line += 1) log.line(`line ${line}`)
    for (let event = 0; event < 100; event += 1) log.cache("miss")
    const trace = proxyTraceOf(log, request(), new Response(null))
    expect(trace.attempts).toHaveLength(6)
    expect(trace.log).toHaveLength(4)
    expect(trace.cache).toHaveLength(4)
    expect(trace.cut).toBeGreaterThan(0)
  })

  it("reads no body of a request that had none", () => {
    const get = new Request("https://courier.test/api/request?_s=api&_g=users&_m=getAll")
    const trace = proxyTraceOf(new CallLog(() => 0), get, new Response(null))
    expect(trace.received?.method).toBe("GET")
    expect(trace.received?.body).toBeUndefined()
  })
})

describe("a call made on the server", () => {
  it("is traced as where it was made, with how long it took and no request of the browser's", () => {
    let now = 10
    const log = new CallLog(() => now)
    served(log)
    now = 25
    const trace = serverTraceOf(log, "render")
    expect(trace.site).toBe("render")
    expect(trace.received).toBeUndefined()
    expect(trace.ms).toBe(15)
    expect(trace.attempts[0]?.target).toMatch(/^\/users/)
    expect(JSON.stringify(trace)).not.toContain(COOKIE)
  })
})
