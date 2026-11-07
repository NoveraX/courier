/**
 * What the inspector takes from the browser's own record of a page's
 * requests: those to the proxy route, named by the call they carry, and a
 * Server Action's POST to the page itself — no other site's, no script's
 * or image's — each with its time, its size, its status as the engine or
 * the site's server says it, and what the server told of it. A request
 * whose answer has an id already seen came from the browser's cache; one
 * with no status and no word from the server got no answer. The log keeps
 * the latest of them and tells its listeners of each it takes.
 */
import { describe, expect, it } from "vitest"

import { NetworkLog, type ResourceEntry, seenRequestOf } from "@/site/inspector/network-log"

const PAGE = { origin: "https://courier.test", pathname: "/docs/examples/basic" }

function entry(overrides: Partial<ResourceEntry> = {}): ResourceEntry {
  return {
    name: "https://courier.test/api/request?_s=api&_g=users&_m=create",
    initiatorType: "fetch",
    startTime: 1200,
    duration: 48,
    transferSize: 311,
    encodedBodySize: 102,
    nextHopProtocol: "h2",
    responseStatus: 201,
    serverTiming: [
      { name: "courier", duration: 30, description: "" },
      { name: "rid", duration: 0, description: "req_a_1" },
      { name: "in", duration: 0, description: "POST /api/request?_s=api&_g=users&_m=create" },
      { name: "api", duration: 12, description: "+7.5 POST 201 /users" },
      { name: "out", duration: 0, description: "201" },
    ],
    ...overrides,
  }
}

describe("a request of the page's", () => {
  it("is the call its address names, with its time, size and what the server told of it", () => {
    const seen = seenRequestOf(entry(), PAGE, 3)
    expect(seen).toMatchObject({
      key: 3,
      page: "/docs/examples/basic",
      call: "api.users.create",
      action: false,
      target: "/api/request?_s=api&_g=users&_m=create",
      start: 1200,
      ms: 48,
      status: 201,
      bytes: 311,
      cached: false,
      unanswered: false,
      via: "fetch",
      protocol: "h2",
    })
    expect(seen?.trace?.attempts).toEqual([
      { method: "POST", target: "/users", outcome: "201", at: 7.5, ms: 12 },
    ])
  })

  it("takes its status from the site's server where the engine records none", () => {
    expect(seenRequestOf(entry({ responseStatus: undefined }), PAGE, 0)?.status).toBe(201)
  })

  it("is a Server Action's POST when it goes to the page's own address", () => {
    const action = entry({ name: "https://courier.test/docs/examples/basic", serverTiming: [] })
    expect(seenRequestOf(action, PAGE, 0)).toMatchObject({ action: true, call: undefined })
  })

  it("is none of the inspector's when it is another site's, a page's prefetch, a script or an image", () => {
    const others = [
      entry({ name: "https://mc.example.org/watch?_s=api&_g=users&_m=create" }),
      entry({ name: "https://courier.test/docs/examples/basic?_rsc=1x2y" }),
      entry({ name: "https://courier.test/_next/static/chunks/page.js", initiatorType: "script" }),
      entry({ name: "https://courier.test/docs/examples/basic", initiatorType: "img" }),
      entry({ name: "not an address" }),
    ]
    for (const other of others) expect(seenRequestOf(other, PAGE, 0)).toBeUndefined()
  })

  it("got no answer when the engine records no status and the server told nothing", () => {
    const cancelled = entry({
      responseStatus: 0,
      transferSize: 0,
      encodedBodySize: 0,
      serverTiming: [],
    })
    expect(seenRequestOf(cancelled, PAGE, 0)).toMatchObject({ unanswered: true })
    expect(
      seenRequestOf(entry({ responseStatus: undefined, serverTiming: [] }), PAGE, 0)
    ).toMatchObject({
      unanswered: false,
    })
  })

  it("came from the browser's cache when nothing came over the network for a body", () => {
    expect(seenRequestOf(entry({ transferSize: 0 }), PAGE, 0)?.cached).toBe(true)
  })
})

describe("a page's network log", () => {
  it("keeps the latest requests, each under its own key, and tells its listeners", () => {
    const log = new NetworkLog(2)
    let told = 0
    const stop = log.subscribe(() => {
      told += 1
    })
    log.add([entry({ startTime: 1 }), entry({ startTime: 2 }), entry({ startTime: 3 })], PAGE)
    expect(log.requests.map((request) => [request.key, request.start])).toEqual([
      [1, 2],
      [2, 3],
    ])
    expect(told).toBe(1)
    log.add([entry({ name: "https://courier.test/logo.svg", initiatorType: "img" })], PAGE)
    expect(told).toBe(1)
    stop()
    log.add([entry({ startTime: 4 })], PAGE)
    expect(told).toBe(1)
  })

  it("marks an answer with an id already seen as the browser cache's, whichever engine recorded it", () => {
    const log = new NetworkLog()
    log.add([entry({ startTime: 1 })], PAGE)
    log.add([entry({ startTime: 2, transferSize: 315 })], PAGE)
    expect(log.requests.map((request) => request.cached)).toEqual([false, true])
  })

  it("tells each request what caused it, by when it was sent", () => {
    const log = new NetworkLog()
    const clicks = [{ at: 1000, sandbox: "create" }]
    const causeOf = (start: number) => clicks.findLast((click) => click.at <= start)?.sandbox
    log.add([entry({ startTime: 900 }), entry({ startTime: 1010 })], PAGE, causeOf)
    expect(log.requests.map((request) => request.cause)).toEqual([undefined, "create"])
  })

  it("hands out the same list until a request is added", () => {
    const log = new NetworkLog()
    log.add([entry()], PAGE)
    const first = log.requests
    expect(log.requests).toBe(first)
    log.add([entry()], PAGE)
    expect(log.requests).not.toBe(first)
  })
})
