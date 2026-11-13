/**
 * The posts a visitor reads twice through the site's proxy route: the
 * second read within 30 s is answered from the server's cache, which keeps
 * a copy for each visitor, whatever else their browser sends — the CDN in
 * front of the site sets a cookie of its own anew with every answer.
 */
import { createHandler, registerSources } from "@noverax/courier/server"
import express from "express"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDemoApp } from "../../server/app"
import { type Served, serve } from "../server/serve"

/* A loopback name: outside production, Courier's proxy serves no other host. */
const SITE = "https://courier.localhost"

let backend: Served
let proxy: ReturnType<typeof createHandler>
let reads = 0

beforeAll(async () => {
  const app = express()
  app.use((request, _response, next) => {
    if (request.method === "GET" && request.path === "/posts") reads += 1
    next()
  })
  app.use(createDemoApp({ log: () => {} }))
  backend = await serve(app)
  /* The sources read the backend's address as they load. */
  process.env.API_URL = backend.url
  registerSources((await import("@/api")).sources)
  proxy = createHandler()
})

afterAll(() => backend.close())

function readPosts(cookie: string) {
  return proxy.handlePost(
    new Request(`${SITE}/api/request?_s=api&_g=posts&_m=cached`, {
      method: "POST",
      headers: {
        origin: SITE,
        "sec-fetch-site": "same-origin",
        "content-type": "application/json",
        "x-forwarded-for": "198.51.100.12",
        cookie,
      },
      body: JSON.stringify({ options: {} }),
    })
  )
}

describe("the posts a visitor reads twice", () => {
  it("are answered from the server's cache the second time, though the CDN's cookie changed", async () => {
    const visitor = "__Host-courier-demo=q3Hf0k2LZp9xW1vB7tYc4A"
    reads = 0

    const first = await readPosts(`__ddg8_=8cKbTwXxQ1aB; ${visitor}`)
    const second = await readPosts(`__ddg8_=HajDsOyY2rCd; ${visitor}`)

    expect([first.status, second.status]).toEqual([200, 200])
    expect(await second.json()).toEqual(await first.json())
    expect(reads).toBe(1)
  })

  it("are each visitor's own", async () => {
    reads = 0

    await readPosts("__Host-courier-demo=AAAAAAAAAAAAAAAAAAAAAA")
    await readPosts("__Host-courier-demo=BBBBBBBBBBBBBBBBBBBBBB")

    expect(reads).toBe(2)
  })
})
