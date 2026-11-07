/**
 * The site's proxy route, inspector on, over Courier's own handler, the
 * site's sources and the examples' backend: each answer's `Server-Timing`
 * tells how the call arrived, each request to the API — its method, path
 * and status, or how it ended without one — the chain it ran through and
 * how the route answered, under the id of its `X-Courier-Rid`. A
 * credential's value, the visitor's address and the API's own address are
 * in none of it; switched off, the route is as it was.
 */

import { courier, defineApi, defineGroup } from "@noverax/courier/define"
import { createHandler, registerSources } from "@noverax/courier/server"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { EXAMPLES_PROXY } from "@/app/api/request/examples-proxy"
import { inspectedRoute } from "@/app/api/request/inspected-route"
import { traceOfTiming } from "@/site/inspector/seen-trace"
import { requestInspection } from "@/site/inspector/server/inspection"
import { recordCalls } from "@/site/inspector/server/recorder"
import { parseServerTiming } from "@/site/inspector/server-timing"
import { createDemoApp } from "../../server/app"
import { DEMO_LIMITS } from "../../server/limits"
import { type Served, serve } from "../server/serve"

const SITE = "https://courier.localhost"
/* A visitor's cookie value of the backend's own form, and the visitor's address: in no trace. */
const VISITOR_COOKIE = "AAAAAAAAAAAAAAAAAAAAAA"
const ADDRESS = "198.51.100.61"

let backend: Served
let route: { post: (request: Request) => Promise<Response> }
let stopRecording: () => void

beforeAll(async () => {
  backend = await serve(createDemoApp({ log: () => {} }))
  process.env.API_URL = backend.url
  const { endpoint } = courier()
  /* Endpoints that retry and time out on the server, against the backend's own routes. */
  const resilient = defineApi({
    baseURL: backend.url,
    expose: true,
    groups: {
      misc: defineGroup({
        prefix: "",
        endpoints: {
          flaky: endpoint
            .get("error/:code")
            .variables<{ code: number }>()
            .retry({ limit: 2, delay: 20, retryOn: [503] }),
          late: endpoint
            .get("slow")
            .timeout(200)
            .retry({ limit: 1, delay: 20, retryOn: ["timeout"] }),
        },
      }),
    },
  })
  registerSources({ ...(await import("@/api")).sources, resilient })
  stopRecording = recordCalls()
  const proxy = createHandler(EXAMPLES_PROXY)
  route = inspectedRoute({ post: (request: Request) => proxy.handlePost(request) }, true)
})

afterAll(async () => {
  stopRecording()
  await backend.close()
})

function call(
  name: string,
  body: BodyInit,
  init: { type?: string; signal?: AbortSignal; query?: string } = {}
) {
  const [source, group, method] = name.split(".")
  const type = init.type ?? "application/json"
  return route.post(
    new Request(`${SITE}/api/request?_s=${source}&_g=${group}&_m=${method}${init.query ?? ""}`, {
      method: "POST",
      headers: {
        origin: SITE,
        "sec-fetch-site": "same-origin",
        "x-forwarded-for": ADDRESS,
        cookie: `__Host-courier-demo=${VISITOR_COOKIE}; theme=dark`,
        ...(type !== "" && { "content-type": type }),
        /* As a browser says it of a body it knows the length of. */
        ...(typeof body === "string" && { "content-length": String(Buffer.byteLength(body)) }),
      },
      body,
      ...(init.signal && { signal: init.signal }),
    })
  )
}

const envelope = (variables: unknown) => JSON.stringify({ variables, options: {} })

/* The trace the page reads of an answer, and the header it read it from. */
function traceIn(response: Response) {
  const header = response.headers.get("server-timing") ?? ""
  return { header, trace: traceOfTiming(parseServerTiming(header)) }
}

function expectNoSecrets(header: string) {
  for (const secret of [VISITOR_COOKIE, ADDRESS, backend.url, new URL(backend.url).host]) {
    expect(header).not.toContain(secret)
  }
}

describe("an answer of the inspected route", () => {
  it("tells how a write arrived and went to the API, under its own id", async () => {
    const response = await call(
      "api.users.create",
      envelope({ name: "Jane Doe", email: "jane@example.com" })
    )
    expect(response.status).toBe(201)
    const { header, trace } = traceIn(response)
    expect(trace?.rid).toBe(response.headers.get("x-courier-rid"))
    expect(trace?.received).toMatchObject({
      method: "POST",
      target: "/api/request?_s=api&_g=users&_m=create",
      body: expect.stringMatching(/^application\/json \d+$/),
    })
    expect(trace?.received?.headers).toContain("cookie(__Host-courier-demo,theme)")
    expect(trace?.variables).toContain("Jane Doe")
    expect(trace?.attempts).toEqual([
      expect.objectContaining({ method: "POST", target: "/users", outcome: "201" }),
    ])
    expect(trace?.sent).toEqual(
      expect.arrayContaining(["cookie(__Host-courier-demo)", "x-visitor-address"])
    )
    expect(trace?.passedBack).toContain("set-cookie(__Host-courier-demo)")
    expect(trace?.status).toBe(201)
    expect(trace?.ms).toBeGreaterThan(0)
    expectNoSecrets(header)
  })

  it("tells of the route's address only what the proxy reads of it: the call it names", async () => {
    const query = "&token=made-up-query-token&made-up-bare-secret&_s=again"
    const response = await call("api.users.getAll", envelope({}), { query })
    expect(response.status).toBe(200)
    const { header, trace } = traceIn(response)
    expect(trace?.received?.target).toBe("/api/request?_s=api&_g=users&_m=getAll")
    for (const secret of ["made-up-query-token", "made-up-bare-secret", "token", "again"]) {
      expect(header).not.toContain(secret)
    }
  })

  it("tells which request the API refused, and with what", async () => {
    const { header, trace } = traceIn(await call("api.misc.error", envelope({ code: 404 })))
    expect(trace?.attempts).toEqual([
      expect.objectContaining({ method: "GET", target: "/error/404", outcome: "404" }),
    ])
    expect(trace?.answered).toContain("content-type")
    expect(trace?.status).toBe(404)
    expectNoSecrets(header)
  })

  it("tells the chain the call ran through, link by link", async () => {
    const { trace } = traceIn(await call("middlewareApi.users.getAll", envelope({})))
    expect(trace?.chain).toEqual([expect.objectContaining({ name: "log", phase: "wrap" })])
    expect(trace?.attempts[0]).toMatchObject({ method: "GET", target: "/users", outcome: "200" })
  })

  it("tells each attempt of a call retried on the server, and one that ran out of time", async () => {
    const retried = traceIn(await call("resilient.misc.flaky", envelope({ code: 503 }))).trace
    expect(retried?.attempts.map((attempt) => attempt.outcome)).toEqual(["503", "503", "503"])
    expect(retried?.status).toBe(503)
    const late = traceIn(await call("resilient.misc.late", envelope(undefined))).trace
    expect(late?.attempts.map((attempt) => attempt.outcome)).toEqual(["timeout", "timeout"])
    expect(late?.status).toBe(504)
  })

  it("tells an upload the API refused apart from one the route refused itself", async () => {
    const over = new FormData()
    over.append("file", new File([new Uint8Array(DEMO_LIMITS.uploadBytes + 1)], "large.bin"))
    const byApi = traceIn(await call("api.files.upload", over, { type: "" })).trace
    expect(byApi?.received?.body).toMatch(/^multipart\/form-data /)
    expect(byApi?.attempts.at(-1)).toMatchObject({
      method: "POST",
      target: "/upload",
      outcome: "413",
    })
    expect(byApi?.variables).toBe('{"streamed":true,"type":"multipart/form-data"}')
    const big = new FormData()
    big.append("file", new File([new Uint8Array(DEMO_LIMITS.uploadBytes * 3)], "huge.bin"))
    const byRoute = traceIn(await call("api.files.upload", big, { type: "" })).trace
    expect(byRoute?.status).toBe(413)
  })

  it("tells a call its browser left that the request to the API was stopped", async () => {
    const leaving = new AbortController()
    setTimeout(() => leaving.abort(), 150)
    const { trace } = traceIn(
      await call("api.misc.slow", envelope(undefined), { signal: leaving.signal })
    )
    expect(trace?.attempts).toEqual([
      expect.objectContaining({ target: "/slow", outcome: "cancelled" }),
    ])
  })
})

describe("the inspector's switch", () => {
  it("is on unless the deployment says off", () => {
    expect(requestInspection({})).toBe(true)
    expect(requestInspection({ DOCS_REQUEST_INSPECTOR: "on" })).toBe(true)
    expect(requestInspection({ DOCS_REQUEST_INSPECTOR: " OFF " })).toBe(false)
  })

  it("off, leaves the route's handlers as they were", () => {
    const handlers = { post: async (_request: Request) => new Response(null) }
    expect(inspectedRoute(handlers, false)).toBe(handlers)
  })
})
