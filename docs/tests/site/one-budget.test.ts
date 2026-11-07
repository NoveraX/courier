/**
 * One budget for each visitor, whichever path their calls take to the
 * examples' backend: through the proxy route, or from server code while a
 * request of theirs is served, as a page renders and a Server Action runs.
 * Both carry the visitor's address and cookie to the backend, which keeps
 * the budget; spent on one path, it is spent on the other. The budgets are
 * small here, and refill too slowly to matter while the test runs.
 */
import { withWebRequestContext } from "@noverax/courier/node"
import {
  createCaller,
  createHandler,
  isHTTPError,
  registerSources,
  type TypedClient,
} from "@noverax/courier/server"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { EXAMPLES_PROXY } from "@/app/api/request/examples-proxy"
import { createDemoApp } from "../../server/app"
import { DEMO_LIMITS } from "../../server/limits"
import { type Served, serve } from "../server/serve"

/* A loopback name: outside production, Courier's proxy serves no other host. */
const SITE = "https://courier.localhost"
const LIMITS = { ...DEMO_LIMITS, calls: 5, writes: 2 }

let backend: Served
let proxy: ReturnType<typeof createHandler>
let server: TypedClient<typeof import("@/api")["sources"]["api"]>

beforeAll(async () => {
  backend = await serve(createDemoApp({ limits: LIMITS, log: () => {} }))
  /* The sources read the backend's address as they load. */
  process.env.API_URL = backend.url
  const { sources } = await import("@/api")
  registerSources(sources)
  proxy = createHandler(EXAMPLES_PROXY)
  server = createCaller(sources.api)
})

afterAll(() => backend.close())

/* The headers a request of the visitor's comes with, as the proxy in front reports them. */
function from(address: string, cookie?: string): Headers {
  const headers = new Headers({
    origin: SITE,
    "sec-fetch-site": "same-origin",
    "content-type": "application/json",
    "x-forwarded-for": address,
  })
  if (cookie !== undefined) headers.set("cookie", cookie)
  return headers
}

/* A call through the proxy route: its status, and the cookie its answer hands the browser. */
async function viaProxy(method: string, headers: Headers, variables: unknown = {}) {
  const response = await proxy.handlePost(
    new Request(`${SITE}/api/request?_s=api&_g=users&_m=${method}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ variables, options: {} }),
    })
  )
  const cookie = /^(__Host-courier-demo=[\w-]+)/.exec(response.headers.get("set-cookie") ?? "")?.[1]
  return { status: response.status, cookie }
}

/* A call from server code while a page request of the visitor's is served: 200, or its refusal's status. */
async function viaServer(headers: Headers, call: () => Promise<unknown>): Promise<number> {
  const page = new Request(`${SITE}/docs/examples/direct`, { headers })
  const served = await withWebRequestContext(page, async () => {
    try {
      await call()
      return new Response(null, { status: 200 })
    } catch (failure) {
      if (!isHTTPError(failure)) throw failure
      return new Response(null, { status: failure.status })
    }
  })
  return served.status
}

const newUser = { name: "Jane Doe", email: "jane@example.com" }

describe("a visitor's budget", () => {
  it("takes the calls of either path from the visitor's address, and refuses both past it", async () => {
    const visitor = from("198.51.100.20")
    expect((await viaProxy("getAll", visitor)).status).toBe(200)
    expect(await viaServer(visitor, () => server.users.getAll())).toBe(200)
    expect((await viaProxy("getAll", visitor)).status).toBe(200)
    expect(await viaServer(visitor, () => server.users.getById({ id: 1 }))).toBe(200)
    expect((await viaProxy("getAll", visitor)).status).toBe(200)
    expect(await viaServer(visitor, () => server.users.getAll())).toBe(429)
    expect((await viaProxy("getAll", visitor)).status).toBe(429)
    expect((await viaProxy("getAll", from("198.51.100.21"))).status).toBe(200)
  })

  it("takes the writes of either path from the visitor's own, from whichever address they come", async () => {
    const first = await viaProxy("create", from("198.51.100.22"), newUser)
    expect(first.status).toBe(201)
    const write = () => server.users.create(newUser)
    expect(await viaServer(from("198.51.100.23", first.cookie), write)).toBe(200)
    expect(await viaServer(from("198.51.100.24", first.cookie), write)).toBe(200)
    expect(await viaServer(from("198.51.100.25", first.cookie), write)).toBe(429)
    const past = await viaProxy("create", from("198.51.100.26", first.cookie), newUser)
    expect(past.status).toBe(429)
    expect((await viaProxy("create", from("198.51.100.27"), newUser)).status).toBe(201)
  })
})
