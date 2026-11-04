/**
 * The endpoint that answers with the error a page asks for: that status,
 * in JSON, for any error code and no other.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDemoApp } from "../../server/app"
import { type Served, serve } from "./serve"

let backend: Served

beforeAll(async () => {
  backend = await serve(createDemoApp({ log: () => {} }))
})

afterAll(() => backend.close())

describe("an error a page asks for", () => {
  it("is answered with that status, in JSON", async () => {
    const response = await fetch(`${backend.url}/error/418`)
    expect(response.status).toBe(418)
    expect(await response.json()).toEqual({
      success: false,
      message: "Intentional 418 error",
      code: 418,
    })
  })

  it("is refused outside the error codes", async () => {
    for (const code of ["399", "600", "4040", "04"]) {
      const response = await fetch(`${backend.url}/error/${code}`)
      expect(response.status, code).toBe(400)
    }
  })
})
