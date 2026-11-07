/**
 * The encoding example's echo: the request as it arrived — its method,
 * its address and query, the type it was sent with, the body as the
 * parser read it, and the bytes it came as — so a page sees what its
 * serializers put on the wire, not only what a parser made of it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDemoApp } from "../../server/app"
import { type Served, serve } from "./serve"

let backend: Served

beforeAll(async () => {
  backend = await serve(createDemoApp({ log: () => {} }), { as: "198.51.100.17" })
})

afterAll(() => backend.close())

describe("the echo", () => {
  it("answers a form with the bytes it came as, beside the fields the parser read", async () => {
    const response = await fetch(`${backend.url}/echo?format=json`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: "apiVersion=v2&name=John+Doe",
    })
    expect(await response.json()).toMatchObject({
      method: "POST",
      contentType: "application/x-www-form-urlencoded;charset=UTF-8",
      body: { apiVersion: "v2", name: "John Doe" },
      rawBody: "apiVersion=v2&name=John+Doe",
      rawQuery: "format=json",
    })
  })

  it("answers JSON with its bytes as they came, spacing and all", async () => {
    const sent = '{ "name": "Jane",  "role": "admin" }'
    const response = await fetch(`${backend.url}/echo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: sent,
    })
    expect(await response.json()).toMatchObject({
      body: { name: "Jane", role: "admin" },
      rawBody: sent,
    })
  })

  it("has no bytes to show of a call that sent no body", async () => {
    const response = await fetch(`${backend.url}/echo?tags%5B%5D=a`)
    expect(await response.json()).toMatchObject({
      method: "GET",
      rawBody: null,
      rawQuery: "tags%5B%5D=a",
    })
  })
})
