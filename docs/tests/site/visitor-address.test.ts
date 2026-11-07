/**
 * Which visitor a call is counted as, behind the chain production has: the
 * DDoS filter, then Traefik, then the site, configured as the README's In
 * production says — the filter's networks trusted, and its header read.
 * Visitors who come through one edge of the filter are told apart by the
 * address it names; one who claims other addresses, in `X-Forwarded-For`
 * or in the filter's header, is counted by their own; and one who goes
 * around the filter is counted by the address Traefik saw, whatever
 * header they send. Each call's budget, as the backend tells it through
 * the proxy route, shows whom it was counted as.
 */
import { createHandler, registerSources } from "@noverax/courier/server"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { EXAMPLES_PROXY } from "@/app/api/request/examples-proxy"
import { createDemoApp } from "../../server/app"
import { chainHeaders, FILTER_NETWORK, type Route } from "../e2e/support/deployment-chain"
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

afterAll(async () => {
  delete process.env.COURIER_TRUSTED_PROXIES
  delete process.env.COURIER_CLIENT_ADDRESS_HEADER
  await backend.close()
})

function trustAsDeployed(trusted: boolean): void {
  process.env.COURIER_TRUSTED_PROXIES = trusted ? FILTER_NETWORK : ""
  process.env.COURIER_CLIENT_ADDRESS_HEADER = trusted ? "DDG-Connecting-IP" : ""
}

/* The calls left in the budget of the address a read from `visitor` was counted as. */
async function callsLeft(
  visitor: string,
  route: Route,
  claimed: Record<string, string> = {}
): Promise<number> {
  const sent = { host: "courier.localhost", ...claimed }
  const headers = new Headers()
  for (const [name, value] of Object.entries(chainHeaders(sent, route, visitor))) {
    if (typeof value === "string") headers.set(name, value)
  }
  headers.set("origin", SITE)
  headers.set("sec-fetch-site", "same-origin")
  headers.set("content-type", "application/json")
  const response = await proxy.handlePost(
    new Request(`${SITE}/api/request?_s=api&_g=users&_m=getAll`, {
      method: "POST",
      headers,
      body: JSON.stringify({ variables: {}, options: {} }),
    })
  )
  expect(response.status).toBe(200)
  return Number(response.headers.get("x-ratelimit-remaining"))
}

describe("a visitor behind the DDoS filter", () => {
  it("is counted by the address the filter names, apart from others through the same edge", async () => {
    trustAsDeployed(true)
    expect(await callsLeft("198.51.100.1", "filter")).toBe(299)
    expect(await callsLeft("198.51.100.1", "filter")).toBe(298)
    expect(await callsLeft("198.51.100.2", "filter")).toBe(299)
  })

  it("is counted by their own address, whatever they claim in X-Forwarded-For or the filter's header", async () => {
    trustAsDeployed(true)
    const claim = { "x-forwarded-for": "198.51.100.2", "ddg-connecting-ip": "198.51.100.2" }
    expect(await callsLeft("198.51.100.3", "filter", claim)).toBe(299)
    expect(await callsLeft("198.51.100.3", "filter", claim)).toBe(298)
    expect(await callsLeft("198.51.100.2", "filter")).toBe(298)
  })
})

describe("a visitor who goes around the filter", () => {
  it("is counted by the address Traefik saw, whatever header they send", async () => {
    trustAsDeployed(true)
    const claim = { "x-forwarded-for": "198.51.100.4", "ddg-connecting-ip": "198.51.100.4" }
    expect(await callsLeft("198.51.100.4", "filter")).toBe(299)
    expect(await callsLeft("198.51.100.66", "direct", claim)).toBe(299)
    expect(await callsLeft("198.51.100.66", "direct", claim)).toBe(298)
    expect(await callsLeft("198.51.100.4", "filter")).toBe(298)
  })
})

describe("the site without the filter's trust", () => {
  it("counts every visitor through one edge as that edge, sharing one budget", async () => {
    trustAsDeployed(false)
    const first = await callsLeft("198.51.100.5", "filter")
    expect(await callsLeft("198.51.100.6", "filter")).toBe(first - 1)
  })
})
