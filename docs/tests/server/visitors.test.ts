/**
 * The examples' backend keeps each visitor's users and posts apart, under
 * the cookie their first change hands them: reading hands them nothing and
 * keeps nothing, a change that fails makes them no copy, an id a call
 * names itself is never taken for theirs, and a visitor keeps no more
 * records than they may.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDemoApp } from "../../server/app"
import { SandboxStore } from "../../server/data/sandbox-store"
import { DEMO_LIMITS } from "../../server/limits"
import { type Served, serve } from "./serve"

const COOKIE =
  /^__Host-courier-demo=([A-Za-z0-9_-]{22}); Path=\/; Max-Age=7200; Secure; HttpOnly; SameSite=Lax$/

let store: SandboxStore
let backend: Served

beforeAll(async () => {
  store = new SandboxStore(DEMO_LIMITS)
  backend = await serve(createDemoApp({ store, log: () => {} }), { as: "198.51.100.15" })
})

afterAll(() => backend.close())

function call(path: string, init: RequestInit & { visitor?: string | undefined } = {}) {
  const { visitor, ...rest } = init
  return fetch(`${backend.url}${path}`, {
    ...rest,
    headers: {
      "content-type": "application/json",
      ...(visitor !== undefined && { cookie: `theme=dark; __Host-courier-demo=${visitor}` }),
    },
  })
}

async function names(visitor?: string): Promise<string[]> {
  const list: { data: { name: string }[] } = await (
    await call("/users?limit=50", { visitor })
  ).json()
  return list.data.map((user) => user.name)
}

async function firstChange(name: string): Promise<string> {
  const response = await call("/users", {
    method: "POST",
    body: JSON.stringify({ name, email: "someone@example.com" }),
  })
  expect(response.status).toBe(201)
  const visitor = COOKIE.exec(response.headers.get("set-cookie") ?? "")?.[1]
  if (visitor === undefined) throw new Error("The first change handed no visitor's cookie")
  return visitor
}

describe("a visitor's first change", () => {
  it("hands them their cookie: for the whole site, over HTTPS, kept from scripts, for two hours", async () => {
    const response = await call("/users", {
      method: "POST",
      body: JSON.stringify({ name: "Jane Doe", email: "jane@example.com" }),
    })
    expect(response.headers.get("set-cookie")).toMatch(COOKIE)
  })

  it("is kept for them, and for no one else", async () => {
    const jane = await firstChange("Jane Doe")
    const john = await firstChange("John Roe")
    expect(await names(jane)).toEqual(["Alice Johnson", "Bob Smith", "Carol Williams", "Jane Doe"])
    expect(await names(john)).toEqual(["Alice Johnson", "Bob Smith", "Carol Williams", "John Roe"])
    expect(await names()).toEqual(["Alice Johnson", "Bob Smith", "Carol Williams"])
  })
})

describe("a visitor's later changes", () => {
  it("change their data alone, and hand them no new cookie", async () => {
    const jane = await firstChange("Jane Doe")
    const removed = await call("/users/1", { method: "DELETE", visitor: jane })
    expect(removed.status).toBe(204)
    expect(removed.headers.get("set-cookie")).toBeNull()
    const renamed = await call("/users/2", {
      method: "PATCH",
      visitor: jane,
      body: JSON.stringify({ name: "Robert Smith" }),
    })
    expect(await renamed.json()).toMatchObject({ id: 2, name: "Robert Smith" })
    expect(await names(jane)).toEqual(["Robert Smith", "Carol Williams", "Jane Doe"])
    expect(await names()).toEqual(["Alice Johnson", "Bob Smith", "Carol Williams"])
  })
})

describe("what keeps nothing", () => {
  it("reading hands no cookie and keeps no copy", async () => {
    const before = store.size
    const response = await call("/users")
    expect(response.headers.get("set-cookie")).toBeNull()
    expect(store.size).toBe(before)
  })

  it("a change that fails makes no copy and hands no cookie", async () => {
    const before = store.size
    const response = await call("/users/9999", {
      method: "PUT",
      body: JSON.stringify({ name: "Nobody", email: "nobody@example.com", role: "user" }),
    })
    expect(response.status).toBe(404)
    expect(response.headers.get("set-cookie")).toBeNull()
    expect(store.size).toBe(before)
  })

  it("an id the call names itself reads the first data, and its first change gets an id of the store's", async () => {
    const chosen = "AAAAAAAAAAAAAAAAAAAAAA"
    expect(await names(chosen)).toEqual(["Alice Johnson", "Bob Smith", "Carol Williams"])
    const response = await call("/users", {
      method: "POST",
      visitor: chosen,
      body: JSON.stringify({ name: "Mallory", email: "mallory@example.com" }),
    })
    const made = COOKIE.exec(response.headers.get("set-cookie") ?? "")?.[1]
    expect(made).toBeDefined()
    expect(made).not.toBe(chosen)
  })
})

describe("a visitor's users", () => {
  it("are kept up to their limit, past which a change is refused with what to do", async () => {
    const small = new SandboxStore(DEMO_LIMITS)
    const limits = { ...DEMO_LIMITS, usersPerVisitor: 4 }
    const app = createDemoApp({ limits, store: small, log: () => {} })
    const limited = await serve(app, { as: "198.51.100.18" })
    try {
      const add = (cookie?: string) =>
        fetch(`${limited.url}/users`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(cookie && { cookie }) },
          body: JSON.stringify({ name: "One more", email: "more@example.com" }),
        })
      const first = await add()
      const visitor = COOKIE.exec(first.headers.get("set-cookie") ?? "")?.[1]
      const refused = await add(`__Host-courier-demo=${visitor}`)
      expect(refused.status).toBe(409)
      expect(await refused.json()).toEqual({
        success: false,
        code: "VISITOR_DATA_FULL",
        message: "The examples keep up to 4 users for each visitor: delete one to add another",
      })
    } finally {
      await limited.close()
    }
  })
})
