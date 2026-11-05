/**
 * A visitor's data, end to end through the proxy the site's route serves:
 * the site's sources registered as the route registers them, and Courier's
 * handler hands a page's call to the examples' backend, which keeps the
 * visitor's first change apart. Courier hands the browser the cookie the
 * backend set, made for the site's HTTPS origin, and carries it with the
 * visitor's later calls — and a page on another site cannot make a change
 * with it.
 */
import { createHandler, registerSources } from "@noverax/courier"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDemoApp } from "../../server/app"
import { type Served, serve } from "../server/serve"

/* A loopback name: outside production, Courier's proxy serves no other host. */
const SITE = "https://courier.localhost"
const COOKIE =
  /^__Host-courier-demo=([A-Za-z0-9_-]{22}); Path=\/; Max-Age=7200; Secure; HttpOnly; SameSite=Lax$/

let backend: Served
let proxy: ReturnType<typeof createHandler>

beforeAll(async () => {
  backend = await serve(createDemoApp({ log: () => {} }))
  /* The sources read the backend's address as they load. */
  process.env.API_URL = backend.url
  registerSources((await import("@/api")).sources)
  proxy = createHandler()
})

afterAll(() => backend.close())

function pageCall(method: string, variables: unknown, headers: Record<string, string> = {}) {
  return proxy.handlePost(
    new Request(`${SITE}/api/request?_s=api&_g=users&_m=${method}`, {
      method: "POST",
      headers: {
        origin: SITE,
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.12",
        ...headers,
      },
      body: JSON.stringify({ variables, options: {} }),
    })
  )
}

async function namesFor(cookie?: string): Promise<string[]> {
  const response = await pageCall("getAll", { limit: 50 }, cookie ? { cookie } : {})
  expect(response.status).toBe(200)
  const list: { data: { name: string }[] } = await response.json()
  return list.data.map((user) => user.name)
}

describe("a visitor's data through the site's proxy route", () => {
  it("is made by their first change, whose answer hands the browser their cookie for the site", async () => {
    const response = await pageCall("create", { name: "Jane Doe", email: "jane@example.com" })
    expect(response.status).toBe(201)
    expect(response.headers.get("set-cookie")).toMatch(COOKIE)
  })

  it("is read back by their later calls, which carry the cookie, and by no one else's", async () => {
    const created = await pageCall("create", { name: "John Roe", email: "john@example.com" })
    const visitor = COOKIE.exec(created.headers.get("set-cookie") ?? "")?.[1]
    const cookie = `__Host-courier-demo=${visitor}; theme=dark`
    expect(await namesFor(cookie)).toEqual([
      "Alice Johnson",
      "Bob Smith",
      "Carol Williams",
      "John Roe",
    ])
    expect(await namesFor()).toEqual(["Alice Johnson", "Bob Smith", "Carol Williams"])
  })

  it("cannot be changed by a page on another site, which the route refuses before the backend hears of it", async () => {
    const created = await pageCall("create", { name: "Ada", email: "ada@example.com" })
    const cookie = `__Host-courier-demo=${COOKIE.exec(created.headers.get("set-cookie") ?? "")?.[1]}`
    const forged = await pageCall(
      "remove",
      { id: 1 },
      { cookie, origin: "https://elsewhere.example", "sec-fetch-site": "cross-site" }
    )
    expect(forged.status).toBe(403)
    expect(await namesFor(cookie)).toContain("Alice Johnson")
  })
})
