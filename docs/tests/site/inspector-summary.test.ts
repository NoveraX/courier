/**
 * The line the inspector heads each request with: the way the call went,
 * leg by leg, with the API's answer and how long it took, and the time in
 * all — or what answered it instead of the API, or that no answer came.
 */
import { describe, expect, it } from "vitest"

import type { SeenRequest } from "@/site/inspector/network-log"
import { duration, requestSummary, serverSummary } from "@/site/inspector/summary"
import type { CallTrace } from "@/site/inspector/trace"

const TRACE: CallTrace = {
  site: "proxy",
  attempts: [{ method: "POST", target: "/users", outcome: "201", at: 7, ms: 12.3 }],
  sent: [],
  answered: [],
  chain: [],
  log: [],
  cache: [],
  status: 201,
  passedBack: [],
  cut: 0,
}

function request(overrides: Partial<SeenRequest> = {}): SeenRequest {
  return {
    key: 0,
    page: "/docs/examples/basic",
    call: "api.users.create",
    action: false,
    target: "/api/request?_s=api&_g=users&_m=create",
    start: 0,
    ms: 48,
    status: 201,
    bytes: 311,
    cached: false,
    unanswered: false,
    via: "fetch",
    protocol: "h2",
    trace: TRACE,
    ...overrides,
  }
}

describe("a duration", () => {
  it("is in tenths under 10 ms, whole ms under a second, tenths of a second past one", () => {
    expect([duration(4.82), duration(48.4), duration(999.4), duration(1240)]).toEqual([
      "4.8 ms",
      "48 ms",
      "999 ms",
      "1.2 s",
    ])
  })

  it("is written in the unit it rounds to, at the edges too", () => {
    expect([duration(9.94), duration(9.96), duration(999.5), duration(999.96)]).toEqual([
      "9.9 ms",
      "10 ms",
      "1.0 s",
      "1.0 s",
    ])
  })
})

describe("a request's line", () => {
  it("tells the way leg by leg, the API's answer and the time in all", () => {
    expect(requestSummary(request())).toBe(
      "browser → /api/request → API (demo): POST /users → 201 in 12 ms; total 48 ms"
    )
  })

  it("tells how many attempts the API's answer took, and one that ran out of time", () => {
    const attempts = [
      { method: "GET", target: "/error/503", outcome: "503", at: 0, ms: 2 },
      { method: "GET", target: "/error/503", outcome: "503", at: 300, ms: 1.5 },
    ]
    expect(requestSummary(request({ trace: { ...TRACE, attempts } }))).toBe(
      "browser → /api/request → API (demo): GET /error/503 → 503 in 1.5 ms, the last of 2 attempts; total 48 ms"
    )
    const late = [{ method: "GET", target: "/slow", outcome: "timeout", at: 0, ms: 1000 }]
    expect(requestSummary(request({ ms: 1012, trace: { ...TRACE, attempts: late } }))).toBe(
      "browser → /api/request → API (demo): GET /slow → timed out after 1.0 s; total 1.0 s"
    )
  })

  it("tells what answered without the API: the site's server, or its cache", () => {
    const refused = request({ trace: { ...TRACE, attempts: [], status: 413 } })
    expect(requestSummary(refused)).toBe(
      "browser → /api/request: the site's server answered 413 without calling the API; total 48 ms"
    )
    const hit = request({ trace: { ...TRACE, attempts: [], status: 200, cache: ["hit 2100"] } })
    expect(requestSummary(hit)).toBe(
      "browser → /api/request: answered from the server's cache, 2.1 s old, without calling the API; total 48 ms"
    )
  })

  it("tells a request the browser's cache answered, and one no answer reached", () => {
    expect(requestSummary(request({ cached: true }))).toBe(
      "browser → /api/request: answered from the browser's cache — nothing was sent"
    )
    expect(requestSummary(request({ unanswered: true, ms: 1003, trace: undefined }))).toBe(
      "browser → /api/request: no answer reached the browser — cancelled or failed after 1.0 s"
    )
  })

  it("tells a request the server told nothing of, and a Server Action's", () => {
    expect(requestSummary(request({ trace: undefined }))).toBe(
      "browser → /api/request: 201 in 48 ms"
    )
    const action = request({
      action: true,
      call: undefined,
      target: "/docs/examples/actions",
      trace: undefined,
    })
    expect(requestSummary(action)).toBe(
      "browser → Server Action (POST /docs/examples/actions): 201 in 48 ms"
    )
  })
})

describe("a call made on the server", () => {
  it("is told where it was made and how its way to the API went", () => {
    const attempts = [{ method: "GET", target: "/users", outcome: "200", at: 0, ms: 3.2 }]
    expect(serverSummary({ ...TRACE, site: "render", attempts })).toBe(
      "on the server, as the page rendered → API (demo): GET /users → 200 in 3.2 ms"
    )
    expect(serverSummary({ ...TRACE, site: "action" })).toBe(
      "in a Server Action → API (demo): POST /users → 201 in 12 ms"
    )
  })
})
