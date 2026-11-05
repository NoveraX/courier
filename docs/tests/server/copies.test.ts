/**
 * Room for each visitor's data, however many first changes come. A first
 * change — from a visitor the backend keeps no data for — makes them a
 * copy of the first data, and the copies one network makes take from a
 * budget of their own: an IPv4 address's, or an IPv6 /48's, which one
 * subscriber may be given whole. A store full of data in use refuses a new
 * copy rather than drop data a visitor is using. The addresses are
 * documentation ones.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createDemoApp } from "../../server/app"
import { SandboxStore } from "../../server/data/sandbox-store"
import { DEMO_LIMITS } from "../../server/limits"
import { type Served, serve } from "./serve"

/** One answer, read whole: what the test looks at. */
interface Answer {
  readonly status: number
  readonly retryAfter: string | null
  readonly visitor: string | undefined
  readonly body: unknown
}

const VISITOR_ADDRESS = "2001:db8:aaaa:1::1"

/* First changes a network tries while the store has no room: more than it may make copies. */
const TRIES = 10

let backend: Served

beforeEach(async () => {
  backend = await serve(createDemoApp({ log: () => {} }))
})

afterEach(() => backend.close())

/* A call as the site's server makes it: from the address it names, with the visitor's cookie. */
async function call(
  at: Served,
  path: string,
  from: string,
  init: { method?: string; visitor?: string | undefined } = {}
): Promise<Answer> {
  const response = await fetch(`${at.url}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      "x-visitor-address": from,
      ...(init.visitor !== undefined && { cookie: `__Host-courier-demo=${init.visitor}` }),
    },
    ...(init.method === "POST" && {
      body: JSON.stringify({ name: "Jane Doe", email: "jane@example.com" }),
    }),
  })
  return {
    status: response.status,
    retryAfter: response.headers.get("retry-after"),
    visitor: /__Host-courier-demo=([\w-]+)/.exec(response.headers.get("set-cookie") ?? "")?.[1],
    body: await response.json(),
  }
}

const create = (from: string, visitor?: string, at = backend) =>
  call(at, "/users", from, { method: "POST", visitor })

async function usersOf(visitor: string | undefined, at = backend): Promise<number> {
  const { body } = await call(at, "/users", VISITOR_ADDRESS, { visitor })
  return (body as { total: number }).total
}

function count(answers: readonly Answer[], status: number): number {
  return answers.filter((answer) => answer.status === status).length
}

/* 25 /64 networks of one /48 a subscriber may be given; and 25 IPv4 addresses. */
const ONE_SUBSCRIBER = (n: number) => `2001:db8:bbbb:ff${n.toString(16).padStart(2, "0")}::1`
const ADDRESSES = (n: number) => `203.0.113.${n + 1}`

describe("a visitor's data", () => {
  it.each([
    ["25 IPv6 networks of one /48", ONE_SUBSCRIBER, 1],
    ["25 IPv4 addresses", ADDRESSES, 25],
  ])("outlasts 500 first changes from %s, each making its copies", async (_, address, networks) => {
    const { status, visitor } = await create(VISITOR_ADDRESS)
    expect(status).toBe(201)
    expect(await usersOf(visitor)).toBe(4)

    const flood: Answer[] = []
    for (let network = 0; network < 25; network += 1) {
      for (let write = 0; write < 20; write += 1) flood.push(await create(address(network)))
    }

    expect(await usersOf(visitor)).toBe(4)
    expect((await create(VISITOR_ADDRESS, visitor)).visitor).toBeUndefined()
    expect(count(flood, 201)).toBe(networks * DEMO_LIMITS.copies)
    const refused = flood.find((answer) => answer.status === 429)
    expect(Number(refused?.retryAfter)).toBeGreaterThan(0)
    expect(refused?.body).toEqual({
      success: false,
      code: "RATE_LIMITED",
      message: expect.stringMatching(
        /^Too many new visitors from this network; try again in \d+ s$/
      ),
    })
  })

  it("is kept while it is in use: a new visitor's copy is refused, 503 and when to try again", async () => {
    const { visitor } = await create(VISITOR_ADDRESS)
    const flood: Answer[] = []
    for (let network = 0; network < DEMO_LIMITS.visitors; network += 1) {
      flood.push(await create(`2001:db8:${(0x1000 + network).toString(16)}::1`))
    }

    expect(await usersOf(visitor)).toBe(4)
    expect(count(flood, 201)).toBe(DEMO_LIMITS.visitors - 1)
    const refused = flood.at(-1)
    expect(refused?.status).toBe(503)
    expect(Number(refused?.retryAfter)).toBeGreaterThan(0)
    expect(refused?.body).toEqual({
      success: false,
      code: "STORE_FULL",
      message: expect.stringMatching(
        /^The examples keep as many visitors' data as they can; try again in \d+ s$/
      ),
    })
    expect((await create(VISITOR_ADDRESS, visitor)).status).toBe(201)
  })
})

describe("a network's copies", () => {
  it("are not taken by a first change refused for room, which goes through once there is room", async () => {
    const clock = { now: 0 }
    const store = new SandboxStore({ ...DEMO_LIMITS, visitors: 2 }, () => clock.now)
    const small = await serve(createDemoApp({ store, log: () => {} }))
    try {
      expect((await create("198.51.100.1", undefined, small)).status).toBe(201)
      expect((await create("198.51.100.2", undefined, small)).status).toBe(201)
      const refused: number[] = []
      for (let tried = 0; tried < TRIES; tried += 1) {
        refused.push((await create("198.51.100.3", undefined, small)).status)
      }
      expect(refused).toEqual(Array(TRIES).fill(503))

      clock.now += DEMO_LIMITS.inUseMs
      expect((await create("198.51.100.3", undefined, small)).status).toBe(201)
      expect(DEMO_LIMITS.copies).toBeLessThan(TRIES)
    } finally {
      await small.close()
    }
  })
})
