/**
 * Whatever the examples' backend cannot take, it refuses before keeping
 * anything, in JSON, with a code a page can act on: a field outside its
 * limits, a body too large or not JSON, a route it does not have. Its every
 * answer is one no cache keeps.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDemoApp } from "../../server/app"
import { type Served, serve } from "./serve"

let backend: Served

beforeAll(async () => {
  backend = await serve(createDemoApp({ log: () => {} }))
})

afterAll(() => backend.close())

function send(path: string, method: string, body: unknown): Promise<Response> {
  return fetch(`${backend.url}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

async function refusal(response: Response): Promise<{ status: number; body: unknown }> {
  expect(response.headers.get("content-type")).toMatch(/^application\/json/)
  return { status: response.status, body: await response.json() }
}

describe("a field outside its limits", () => {
  it("refuses a name longer than a name may be, and keeps no user", async () => {
    const before = await (await fetch(`${backend.url}/users?limit=50`)).json()
    const answer = await refusal(
      await send("/users", "POST", { name: "x".repeat(81), email: "jane@example.com" })
    )
    expect(answer).toEqual({
      status: 400,
      body: {
        success: false,
        code: "INVALID_FIELD",
        message: "name is text of 1 to 80 characters",
      },
    })
    const after = await (await fetch(`${backend.url}/users?limit=50`)).json()
    expect(after.total).toBe(before.total)
  })

  it("refuses a name that is not text, an address that is not one, and a role there is not", async () => {
    const asked = [
      { name: { first: "Jane" }, email: "jane@example.com" },
      { name: "Jane", email: "jane at example" },
      { name: "Jane", email: "jane@example.com", role: "root" },
      { name: "Jane\u0000Doe", email: "jane@example.com" },
    ]
    const codes = await Promise.all(
      asked.map(async (body) => (await refusal(await send("/users", "POST", body))).body)
    )
    expect(codes).toEqual([
      expect.objectContaining({ code: "INVALID_FIELD", message: expect.stringMatching(/^name /) }),
      expect.objectContaining({ code: "INVALID_FIELD", message: "email is an e-mail address" }),
      expect.objectContaining({
        code: "INVALID_FIELD",
        message: "role is admin, user or moderator",
      }),
      expect.objectContaining({ code: "INVALID_FIELD", message: expect.stringMatching(/^name /) }),
    ])
  })

  it("refuses a replacement that leaves a field out", async () => {
    const answer = await refusal(await send("/users/2", "PUT", { name: "Bob", role: "user" }))
    expect(answer.status).toBe(400)
    expect(answer.body).toMatchObject({
      code: "INVALID_FIELD",
      message: "email is text of 1 to 254 characters",
    })
  })

  it("refuses a page larger than a page may be, and a page before the first", async () => {
    for (const query of ["limit=51", "limit=0", "page=0", "page=-1", "limit=1e3", "page=abc"]) {
      const answer = await refusal(await fetch(`${backend.url}/users?${query}`))
      expect(answer.status, query).toBe(400)
    }
  })

  it("refuses an error code that is not a number, rather than failing on it", async () => {
    const answer = await refusal(await fetch(`${backend.url}/error/abc`))
    expect(answer).toEqual({
      status: 400,
      body: {
        success: false,
        code: "INVALID_FIELD",
        message: "code is a whole number from 400 to 599",
      },
    })
  })
})

describe("a change to part of a user", () => {
  it("changes the fields a user has, and never its id, its creation time, or what it is not", async () => {
    const before = await (await fetch(`${backend.url}/users/3`)).json()
    const response = await send("/users/3", "PATCH", {
      name: "Carol W.",
      id: 999,
      createdAt: "1970-01-01T00:00:00Z",
      admin: true,
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ...before, name: "Carol W." })
  })

  it("refuses a change that names none of a user's fields", async () => {
    const answer = await refusal(await send("/users/3", "PATCH", { admin: true }))
    expect(answer.status).toBe(400)
  })
})

describe("a body the backend cannot read", () => {
  it("refuses JSON that does not parse", async () => {
    const answer = await refusal(await send("/users", "POST", '{"name":'))
    expect(answer).toEqual({
      status: 400,
      body: { success: false, code: "INVALID_BODY", message: "The body is not valid JSON" },
    })
  })

  it("refuses JSON that is not an object of fields", async () => {
    const answer = await refusal(await send("/users", "POST", ["Jane", "jane@example.com"]))
    expect(answer.status).toBe(400)
    expect(answer.body).toMatchObject({ code: "INVALID_BODY" })
  })

  it("refuses a body larger than it reads, saying how large it reads", async () => {
    const answer = await refusal(await send("/echo", "POST", { text: "x".repeat(16 * 1024) }))
    expect(answer).toEqual({
      status: 413,
      body: {
        success: false,
        code: "BODY_TOO_LARGE",
        message: "The body is larger than the 16 KiB the backend reads",
      },
    })
  })
})

describe("a route or a record the backend does not have", () => {
  it("answers 404 in JSON, naming the route", async () => {
    const answer = await refusal(await fetch(`${backend.url}/nowhere`, { method: "DELETE" }))
    expect(answer).toEqual({
      status: 404,
      body: {
        success: false,
        code: "ROUTE_NOT_FOUND",
        message: "The backend has no route DELETE /nowhere",
      },
    })
  })

  it("answers 404 in JSON, naming the record", async () => {
    const answer = await refusal(await fetch(`${backend.url}/users/9999`))
    expect(answer).toEqual({
      status: 404,
      body: { success: false, code: "NOT_FOUND", message: "No user #9999" },
    })
  })
})

describe("every answer", () => {
  it("is one no cache keeps, and names neither the server nor a version of the data", async () => {
    for (const response of [
      await fetch(`${backend.url}/users`),
      await fetch(`${backend.url}/nowhere`),
      await send("/users", "POST", "{"),
    ]) {
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(response.headers.get("etag")).toBeNull()
      expect(response.headers.get("x-powered-by")).toBeNull()
    }
  })
})
