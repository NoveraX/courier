/**
 * @vitest-environment jsdom
 */
/**
 * Pausing stops the recording of new requests; the ones already shown still
 * end. Dropping every event while paused left a stream that ended during
 * the pause pending for good.
 */
import { beforeEach, describe, expect, it } from "vitest"

import type { StudioEvent } from "@/store"
import { useStudioStore } from "@/store"

type Event = StudioEvent & Record<string, unknown>

function event(type: string, id: string, fields: Record<string, unknown> = {}): Event {
  return { id, type: type as Event["type"], timestamp: 1, sessionId: "s", requestId: id, ...fields }
}

const entry = (id: string) => useStudioStore.getState().requests.find((r) => r.id === id)

beforeEach(() => {
  useStudioStore.setState({ requests: [], droppedRequests: 0, paused: false })
  useStudioStore.getState().handleEvents([
    event("stream:open", "s1", { source: "api", method: "ticks", transport: "sse" }),
    event("request:start", "r1", { source: "api", method: "slow" }),
  ])
  useStudioStore.getState().togglePaused()
})

describe("while recording is paused", () => {
  it("ends a stream that ends", () => {
    useStudioStore.getState().handleEvents([
      event("stream:message", "s1", { dataSize: 4, seq: 1 }),
      event("stream:close", "s1", { reason: "complete", eventCount: 20, duration: 900 }),
    ])

    expect(entry("s1")).toMatchObject({ status: "success", streamStatus: "complete", streamEventCount: 20 })
  })

  it("ends a request that ends", () => {
    useStudioStore.getState().handleEvents([event("request:end", "r1", { status: 200 })])

    expect(entry("r1")?.status).toBe("success")
  })

  it("records no new request", () => {
    useStudioStore.getState().handleEvents([
      event("request:start", "r2", { source: "api", method: "list" }),
      event("stream:open", "s2", { source: "api", method: "ticks", transport: "sse" }),
      event("request:end", "r2", { status: 200 }),
    ])

    expect(useStudioStore.getState().requests.map((r) => r.id).sort()).toEqual(["r1", "s1"])
  })
})
