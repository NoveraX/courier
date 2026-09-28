/**
 * @vitest-environment jsdom
 */
/**
 * A request that failed its schema is a validation error with its issues
 * listed, and a cancelled one is aborted — as the runtime reports them
 * (`validation`, `aborted`). Both used to show as a red "Error", the Status
 * filter's "Validation Error" and "Aborted" matched nothing, and the issues
 * a failed validation reported were thrown away.
 */
import { beforeEach, describe, expect, it } from "vitest"

import type { StudioEvent } from "@/store"
import { useStudioStore } from "@/store"
import { EMPTY_FILTERS } from "@/store/constants"
import { computeKPIs } from "@/views/analytics/compute-kpis"
import { filterRequests } from "@/views/timeline/filters"

type Event = StudioEvent & Record<string, unknown>

function event(type: string, fields: Record<string, unknown>): Event {
  return { id: "r1", type: type as Event["type"], timestamp: 1, sessionId: "s", ...fields }
}

const start = event("request:start", { source: "api", group: "users", method: "get" })

function statusOf(id = "r1") {
  return useStudioStore.getState().requests.find((r) => r.id === id)
}

beforeEach(() => {
  useStudioStore.setState({ requests: [], droppedRequests: 0, paused: false })
})

describe("a request that failed its response schema", () => {
  beforeEach(() => {
    useStudioStore.getState().handleEvents([
      start,
      event("validation:fail", {
        requestId: "r1",
        target: "response",
        issues: [
          { message: "Expected a number", path: ["user", { key: "age" }] },
          { message: "Required" },
        ],
      }),
      event("request:error", {
        requestId: "r1",
        error: { type: "validation", message: "Validation failed (response): Expected a number; Required" },
      }),
    ])
  })

  it("is a validation error", () => {
    expect(statusOf()?.status).toBe("validation_error")
  })

  it("keeps the issues the validation reported, each with its path", () => {
    expect(statusOf()?.error?.validationIssues).toEqual([
      { path: "user.age", message: "Expected a number" },
      { path: "", message: "Required" },
    ])
  })

  it("is what the Validation Error filter finds", () => {
    const found = filterRequests(useStudioStore.getState().requests, {
      ...EMPTY_FILTERS,
      status: ["validation_error"],
    })

    expect(found.map((r) => r.id)).toEqual(["r1"])
  })
})

describe("a request its caller cancelled", () => {
  beforeEach(() => {
    useStudioStore.getState().handleEvents([
      start,
      event("request:error", { requestId: "r1", error: { type: "aborted", message: "This operation was aborted" } }),
    ])
  })

  it("is aborted", () => {
    expect(statusOf()?.status).toBe("aborted")
  })

  it("is what the Aborted filter finds", () => {
    const found = filterRequests(useStudioStore.getState().requests, { ...EMPTY_FILTERS, status: ["aborted"] })

    expect(found.map((r) => r.id)).toEqual(["r1"])
  })

  it("is not counted as an error", () => {
    expect(computeKPIs(useStudioStore.getState().requests).errorCount).toBe(0)
  })
})

describe("a request that failed otherwise", () => {
  it("is an error", () => {
    useStudioStore.getState().handleEvents([
      start,
      event("request:error", { requestId: "r1", error: { type: "http", status: 500, message: "HTTP 500" } }),
    ])

    expect(statusOf()?.status).toBe("error")
  })
})
