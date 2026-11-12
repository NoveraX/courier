/**
 * A call the examples' backend fails to answer: answered 500 `INTERNAL`,
 * with no details, which go to the log alone. The log names the call as it
 * came, its path as data: whatever the path holds, the line says it and the
 * failure beside it.
 */
import { format } from "node:util"

import express from "express"
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest"

import { answerFailures } from "../../server/answers"
import { type Served, serve } from "./serve"

let backend: Served

beforeAll(async () => {
  const app = express()
  app.use(() => {
    throw new Error("the store is gone")
  })
  app.use(answerFailures(() => {}, 1024))
  backend = await serve(app)
})

afterAll(() => backend.close())

afterEach(() => {
  vi.restoreAllMocks()
})

it("logs the call it failed with its path as data, whatever the path holds, and the failure", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {})
  const answer = await fetch(`${backend.url}/users/%c%s%d`)
  expect(answer.status).toBe(500)
  expect(await answer.json()).toEqual({
    success: false,
    message: "The backend failed to answer",
    code: "INTERNAL",
  })
  /* As the console writes it, its first argument a format. */
  expect(logged).toHaveBeenCalledTimes(1)
  const line = format(...(logged.mock.calls[0] ?? []))
  expect(line).toMatch(/^The examples' backend failed to answer GET \/users\/%c%s%d Error: /)
  expect(line).toContain("Error: the store is gone\n    at ")
})
