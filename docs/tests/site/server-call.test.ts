/**
 * What a Server Action tells the page its call failed with, and what it
 * keeps to the log: the failure whole, beside what the action was doing,
 * which the log takes as data, whatever it holds.
 */
import { format } from "node:util"

import { afterEach, expect, it, vi } from "vitest"

import { actionFailure } from "@/site/sandbox/server-call"

afterEach(() => {
  vi.restoreAllMocks()
})

it("logs what the action was doing as data, whatever it holds, and the failure whole", () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {})
  const doing = "Failed to rename %c to %s."
  expect(actionFailure(new Error("the store is gone"), doing)).toBe(doing)
  expect(logged).toHaveBeenCalledTimes(1)
  /* As the console writes it, its first argument a format. */
  const line = format(...(logged.mock.calls[0] ?? []))
  expect(line).toMatch(/^Failed to rename %c to %s\. Error: the store is gone\n {4}at /)
})
