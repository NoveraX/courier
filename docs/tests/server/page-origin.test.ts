/**
 * The examples' backend is called by the site's own server alone — its
 * proxy route passes a page's call on with the page's `Origin`, and its
 * pages and Server Actions call it directly — so it answers whatever origin
 * the page is on: the site's own in production, not only localhost.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDemoApp } from "../../server/app"
import { type Served, serve } from "./serve"

let backend: Served

beforeAll(async () => {
  backend = await serve(createDemoApp())
})

afterAll(() => backend.close())

describe("a call from a page", () => {
  it("is answered when the page is on the site's own origin", async () => {
    const response = await fetch(`${backend.url}/users`, {
      headers: { origin: "https://courier.noverax.cloud" },
    })
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toMatch(/^application\/json/)
  })

  it("is answered when the page is on any other origin, as the proxy decides who may call", async () => {
    const response = await fetch(`${backend.url}/users`, {
      method: "POST",
      headers: { origin: "https://staging.example.com", "content-type": "application/json" },
      body: JSON.stringify({ name: "Jane Doe", email: "jane@example.com" }),
    })
    expect(response.status).toBe(201)
  })

  it("carries no CORS headers: no browser calls the backend itself", async () => {
    const response = await fetch(`${backend.url}/users`, {
      headers: { origin: "http://localhost:3000" },
    })
    expect(response.headers.get("access-control-allow-origin")).toBeNull()
    expect(response.headers.get("access-control-allow-credentials")).toBeNull()
  })
})
