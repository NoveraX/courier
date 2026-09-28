/**
 * @vitest-environment jsdom
 */
/**
 * The Middleware view's chain for a request a middleware stopped: the
 * request shows as failed, not "pending", and no HTTP fetch is drawn for a
 * request that never reached one.
 */
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { TooltipProvider } from "@/components/ui/tooltip"
import type { MiddlewareEntry, RequestEntry } from "@/store"
import { ChainView } from "@/views/middleware/chain-view"
import { buildChain } from "@/views/middleware/helpers"

function step(name: string, index: number, status: MiddlewareEntry["status"], phase: string): MiddlewareEntry {
  return { requestId: "r1", name, index, startedAt: 1, status, phase, duration: 1, ...(status === "error" && { error: "middleware exploded" }) }
}

function request(fields: Partial<RequestEntry>): RequestEntry {
  return {
    id: "r1",
    source: "api",
    group: "faults",
    method: "mwError",
    variables: undefined,
    mode: "direct",
    status: "error",
    error: { type: "unknown", message: "middleware exploded" },
    middlewareCount: 3,
    middlewareEntries: [
      step("stamp-header", 0, "completed", "before"),
      step("timing-after", 1, "completed", "after"),
      step("boom-mw", 2, "error", "before"),
    ],
    hasValidation: { variables: false, response: false },
    startedAt: 1,
    timing: { total: 3, middleware: 3, fetch: 0, validation: 0 },
    sessionId: "s",
    ...fields,
  }
}

function showChain(r: RequestEntry): void {
  render(
    <TooltipProvider>
      <ChainView
        requests={[r]}
        selectedId={r.id}
        selectedRequest={r}
        chain={buildChain(r)}
        aggregateStats={[]}
        onSelectRequest={() => {}}
        onBack={() => {}}
      />
    </TooltipProvider>,
  )
}

afterEach(cleanup)

describe("the chain of a request a middleware stopped", () => {
  it("shows the request as failed", () => {
    showChain(request({}))

    expect(screen.queryByText("pending")).toBeNull()
    expect(screen.getByText("error")).toBeTruthy()
  })

  it("draws no HTTP fetch", () => {
    showChain(request({}))

    expect(screen.queryByText("HTTP Fetch")).toBeNull()
  })
})

describe("the chain of a request that reached its upstream", () => {
  it("draws the HTTP fetch and the status the upstream answered", () => {
    showChain(request({ status: "error", statusCode: 404, url: "http://upstream.test/faults/404", timing: { total: 5, middleware: 1, fetch: 4, validation: 0 } }))

    expect(screen.getByText("HTTP Fetch")).toBeTruthy()
    expect(screen.getByText("404")).toBeTruthy()
  })
})
