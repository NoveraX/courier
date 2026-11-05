/**
 * Every endpoint the site's sources describe is one the examples' backend
 * serves. A page compiles only against the endpoints its routes module
 * lists, but nothing in a build knows what the backend answers: an
 * endpoint described and not served would reach a reader as a 404. So each
 * endpoint of each routes module is called through the proxy, with
 * variables enough to fill any path, and none may be answered that the
 * backend has no such route — or that the proxy has no such endpoint.
 * Each call comes from an address of its own, so that no budget refuses
 * one before the backend has looked for its route.
 */
import { createHandler, registerSources } from "@noverax/courier"
import { courier, defineApi, defineGroup } from "@noverax/courier/define"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { apiRoutes, encodedApiRoutes, middlewareApiRoutes } from "@/lib/routes"
import { createDemoApp } from "../../server/app"
import { type Served, serve } from "../server/serve"

/* A loopback name: outside production, Courier's proxy serves no other host. */
const SITE = "https://courier.localhost"

/* Enough to fill any endpoint's path and body: what an endpoint does not take, the backend leaves. */
const VARIABLES = {
  id: 1,
  postId: 1,
  code: 418,
  page: 1,
  limit: 1,
  name: "Jane Doe",
  email: "jane@example.com",
  role: "user",
  title: "A post",
  body: "Its text",
}

let backend: Served
let proxy: ReturnType<typeof createHandler>
let callers = 0

beforeAll(async () => {
  backend = await serve(createDemoApp({ log: () => {} }))
  /* The sources read the backend's address as they load. */
  process.env.API_URL = backend.url
  const { sources } = await import("@/api")
  const { endpoint } = courier()
  /* A source describing an endpoint the backend has no route for, which the check has to catch. */
  const unserved = defineApi({
    baseURL: backend.url,
    expose: true,
    groups: {
      misc: defineGroup({ prefix: "", endpoints: { health: endpoint.get("health-check") } }),
    },
  })
  registerSources({ ...sources, unserved })
  proxy = createHandler()
})

afterAll(() => backend.close())

/* The endpoints that answered as if no such endpoint or route were there, with what they answered. */
async function unservedOf(source: string, names: readonly string[]): Promise<string[]> {
  const answers = await Promise.all(
    names.map(async (name) => {
      const [group, method] = name.split(".")
      callers += 1
      const response = await proxy.handlePost(
        new Request(`${SITE}/api/request?_s=${source}&_g=${group}&_m=${method}`, {
          method: "POST",
          headers: {
            origin: SITE,
            "sec-fetch-site": "same-origin",
            "content-type": "application/json",
            "x-forwarded-for": `198.51.100.${callers}`,
          },
          body: JSON.stringify({ variables: VARIABLES, options: {} }),
        })
      )
      const text = await response.text()
      const missing = text.includes('"ROUTE_NOT_FOUND"') || text.includes("method not found")
      const unchecked = response.status === 429
      return missing || unchecked ? `${source}.${name}: ${response.status} ${text}` : undefined
    })
  )
  return answers.filter((answer) => answer !== undefined)
}

describe("the site's endpoints", () => {
  it("are each served by the examples' backend", async () => {
    const unserved = await Promise.all(
      [apiRoutes, encodedApiRoutes, middlewareApiRoutes].map(({ source, endpoints }) =>
        unservedOf(source, Object.keys(endpoints))
      )
    )
    expect(unserved.flat()).toEqual([])
  })

  it("would include one the backend does not serve, which the check names", async () => {
    expect(await unservedOf("unserved", ["misc.health"])).toEqual([
      expect.stringMatching(/^unserved\.misc\.health: 404 .*ROUTE_NOT_FOUND/),
    ])
  })
})
