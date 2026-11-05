/**
 * How the site's proxy route serves the live examples: Courier's handler
 * with the route's own settings, over the site's sources and the examples'
 * backend. The route sends the backend each caller's address, which the
 * backend keeps their budgets by: the page is told what is left, and a
 * call past a budget is answered 429 with when to try again, without
 * holding back another caller. A body is read only as large as the
 * backend takes it.
 */
import { createHandler, registerSources } from "@noverax/courier"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { EXAMPLES_PROXY } from "@/app/api/request/examples-proxy"
import { createDemoApp } from "../../server/app"
import { DEMO_LIMITS } from "../../server/limits"
import { type Served, serve } from "../server/serve"

/* A loopback name: outside production, Courier's proxy serves no other host. */
const SITE = "https://courier.localhost"

let backend: Served
let proxy: ReturnType<typeof createHandler>

beforeAll(async () => {
  backend = await serve(createDemoApp({ log: () => {} }))
  /* The sources read the backend's address as they load. */
  process.env.API_URL = backend.url
  registerSources((await import("@/api")).sources)
  proxy = createHandler(EXAMPLES_PROXY)
})

afterAll(() => backend.close())

/* A page's call, from a user at `address`, as the deployment's proxy in front reports them. */
function pageCall(
  address: string,
  route: string,
  body: BodyInit,
  type = "application/json"
): Promise<Response> {
  const [group, method] = route.split(".")
  return proxy.handlePost(
    new Request(`${SITE}/api/request?_s=api&_g=${group}&_m=${method}`, {
      method: "POST",
      headers: {
        origin: SITE,
        "sec-fetch-site": "same-origin",
        "x-forwarded-for": address,
        ...(type !== "" && { "content-type": type }),
      },
      body,
    })
  )
}

const envelope = (variables: unknown) => JSON.stringify({ variables, options: {} })
const newUser = envelope({ name: "Jane Doe", email: "jane@example.com" })

describe("a caller's budget, kept by the backend", () => {
  it("is told with every answer: calls left after a read, writes left after a write", async () => {
    const read = await pageCall("198.51.100.1", "users.getAll", envelope({}))
    expect(read.status).toBe(200)
    expect(read.headers.get("x-ratelimit-limit")).toBe("300")
    expect(read.headers.get("x-ratelimit-remaining")).toBe("299")
    const write = await pageCall("198.51.100.1", "users.create", newUser)
    expect(write.status).toBe(201)
    expect(write.headers.get("x-ratelimit-limit")).toBe("20")
    expect(write.headers.get("x-ratelimit-remaining")).toBe("19")
  })

  it("refuses a caller's write past 20 a minute with 429 and when to try again, and no one else's", async () => {
    for (let write = 0; write < 20; write += 1) {
      expect((await pageCall("198.51.100.2", "users.create", newUser)).status).toBe(201)
    }
    const refused = await pageCall("198.51.100.2", "users.create", newUser)
    expect(refused.status).toBe(429)
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0)
    expect(await refused.json()).toMatchObject({ code: "RATE_LIMITED" })
    expect((await pageCall("198.51.100.2", "users.getAll", envelope({}))).status).toBe(200)
    expect((await pageCall("198.51.100.3", "users.create", newUser)).status).toBe(201)
  })
})

describe("a body", () => {
  it("is refused past the backend's limit, before the backend reads it", async () => {
    const text = "x".repeat(DEMO_LIMITS.bodyBytes)
    const refused = await pageCall("198.51.100.4", "echo.send", envelope({ text }))
    expect(refused.status).toBe(413)
  })

  it("passes on an upload of the largest file the example takes, with its fields", async () => {
    const form = new FormData()
    form.append("file", new File([new Uint8Array(DEMO_LIMITS.uploadBytes)], "photo.jpg"))
    form.append("description", "x".repeat(DEMO_LIMITS.uploadFieldBytes))
    const response = await pageCall("198.51.100.5", "files.upload", form, "")
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ file: { size: DEMO_LIMITS.uploadBytes } })
  })

  it("refuses an upload past what the example takes, before the backend reads it", async () => {
    const form = new FormData()
    const past = DEMO_LIMITS.uploadBytes + DEMO_LIMITS.uploadFields * DEMO_LIMITS.uploadFieldBytes
    form.append("file", new File([new Uint8Array(past + 32 * 1024)], "large.bin"))
    expect((await pageCall("198.51.100.6", "files.upload", form, "")).status).toBe(413)
  })
})
