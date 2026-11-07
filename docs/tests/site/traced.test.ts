/**
 * A call made on the site's server — as a page renders, or in a Server
 * Action — traced as the proxy route's calls are: each request to the API
 * with its path and status, the headers sent by name, and how long it
 * took, beside what the call came to — its data, or the API's refusal. No
 * cookie's value, nor the visitor's address or the API's, is in it, and
 * with the inspector off a call is made and answered as before, untraced.
 */
import { createCaller, registerSources } from "@noverax/courier/server"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { recordCalls } from "@/site/inspector/server/recorder"
import { traced } from "@/site/inspector/server/traced"
import { createDemoApp } from "../../server/app"
import { type Served, serve } from "../server/serve"

/* The sources read the backend's address as they load: they are loaded once it is served. */
async function callerOfSources() {
  const { api, sources } = await import("@/api")
  registerSources(sources)
  return createCaller(api)
}

let backend: Served
let caller: Awaited<ReturnType<typeof callerOfSources>>
let stopRecording: () => void

beforeAll(async () => {
  backend = await serve(createDemoApp({ log: () => {} }), { as: "198.51.100.71" })
  process.env.API_URL = backend.url
  caller = await callerOfSources()
  stopRecording = recordCalls()
})

afterAll(async () => {
  stopRecording()
  await backend.close()
})

describe("a call made on the server", () => {
  it("is traced where it was made, with its request to the API and its data", async () => {
    const { answer, trace } = await traced("render", () => caller.users.getAll())
    expect(answer.data?.total).toBe(3)
    expect(trace?.site).toBe("render")
    expect(trace?.attempts).toEqual([
      expect.objectContaining({ method: "GET", target: "/users", outcome: "200" }),
    ])
    expect(trace?.status).toBe(200)
    expect(trace?.ms).toBeGreaterThan(0)
    expect(JSON.stringify(trace)).not.toContain(new URL(backend.url).host)
  })

  it("is traced in a Server Action too, with the refusal the API answered", async () => {
    const { answer, trace } = await traced("action", () => caller.misc.error({ code: 404 }))
    expect(answer).toMatchObject({ status: 404, error: "Intentional 404 error" })
    expect(trace).toMatchObject({ site: "action", status: 404 })
    expect(trace?.attempts[0]).toMatchObject({ target: "/error/404", outcome: "404" })
  })

  it("is made and answered untraced with the inspector off", async () => {
    const { answer, trace } = await traced("render", () => caller.users.getById({ id: 1 }), false)
    expect(answer.data?.name).toBe("Alice Johnson")
    expect(trace).toBeUndefined()
  })

  it("fails as the call does when the failure is no answer of the API's", async () => {
    const broken = () => Promise.reject(new TypeError("no such call"))
    await expect(traced("render", broken)).rejects.toThrow("no such call")
  })
})
