/**
 * The slow endpoint answers after three seconds, and stops waiting once its
 * caller's connection is gone. The file calls the backend over `node:http`
 * alone: `fetch` keeps timers of its own for its pooled connections, which
 * would be counted with the backend's.
 */
import { request } from "node:http"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { createDemoApp } from "../../server/app"
import { type Served, serve } from "./serve"

let backend: Served

/* A call over a connection of its own, its answer read to the end. */
function answered(path: string): Promise<void> {
  return new Promise((resolve, reject) => {
    request(`${backend.url}${path}`, { agent: false }, (response) => {
      response.resume()
      response.once("end", resolve)
    })
      .once("error", reject)
      .end()
  })
}

beforeAll(async () => {
  backend = await serve(createDemoApp({ log: () => {} }), { as: "198.51.100.16" })
  /* With real timers: the budgets keep a timer of their own from a visitor's first call, which the
     fake ones below would count with the slow endpoint's. */
  await answered("/users")
})

afterAll(() => backend.close())

describe("a slow answer", () => {
  it("stops waiting once its caller's connection is gone", async () => {
    /* Only the timers the backend's code sets: the network's own run as they do. */
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    try {
      /* A connection of its own: a pooled one outlives the call it carried. */
      const call = request(`${backend.url}/slow`, { agent: false })
      const failed = new Promise<NodeJS.ErrnoException>((resolve) => call.once("error", resolve))
      call.end()
      await expect.poll(() => vi.getTimerCount()).toBe(1)
      call.destroy()
      expect((await failed).code).toBe("ECONNRESET")
      await expect.poll(() => vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
