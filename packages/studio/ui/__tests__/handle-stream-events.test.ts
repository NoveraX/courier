import { describe, expect, it } from "vitest"

import type { EventType, RequestEntry } from "@/store"
import { applyEvents } from "@/store/apply-events"

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<RequestEntry> = {}): RequestEntry {
  return {
    id: "req-1",
    source: "api",
    group: "users",
    method: "getAll",
    variables: undefined,
    mode: "direct",
    status: "pending",
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: false, response: false },
    startedAt: 1000,
    sessionId: "s-1",
    transport: "sse",
    streamStatus: "streaming",
    streamEventCount: 0,
    streamTotalBytes: 0,
    ...overrides,
  }
}

function apply(
  requests: RequestEntry[],
  type: EventType,
  fields: Record<string, unknown>,
  maxRequests = 100,
): { requests: RequestEntry[]; droppedCount: number } {
  const event = { id: "ev-1", type, timestamp: 0, sessionId: "s-1", ...fields }
  return applyEvents(requests, [event], { maxRequests, ignorePatterns: [], paused: false })
}

/** Get request at index with runtime assertion — avoids noUncheckedIndexedAccess noise */
function reqAt(requests: RequestEntry[], index: number): RequestEntry {
  const r = requests[index]
  if (!r) throw new Error(`No request at index ${index} (length: ${requests.length})`)
  return r
}

// ── stream:open ─────────────────────────────────────────────────────────

describe("stream:open", () => {
  it("creates an SSE entry with correct defaults", () => {
    const result = apply([], "stream:open", {
      requestId: "r-1",
      source: "api",
      group: "users",
      method: "list",
      transport: "sse",
      timestamp: 5000,
      sessionId: "s-1",
    })

    expect(result.requests).toHaveLength(1)
    const entry = reqAt(result.requests, 0)
    expect(entry.id).toBe("r-1")
    expect(entry.transport).toBe("sse")
    expect(entry.streamStatus).toBe("streaming")
    expect(entry.streamEventCount).toBe(0)
    expect(entry.streamTotalBytes).toBe(0)
    expect(entry.startedAt).toBe(5000)
    expect(result.droppedCount).toBe(0)
  })

  it("creates a WS entry when transport is ws", () => {
    const result = apply([], "stream:open", {
      requestId: "r-2",
      source: "api",
      method: "subscribe",
      transport: "ws",
      sessionId: "s-1",
    })

    expect(reqAt(result.requests, 0).transport).toBe("ws")
  })

  it("defaults non-ws transport to sse", () => {
    const result = apply([], "stream:open", {
      requestId: "r-3",
      source: "api",
      method: "listen",
      transport: "unknown",
      sessionId: "s-1",
    })

    expect(reqAt(result.requests, 0).transport).toBe("sse")
  })

  it("prepends new entry before existing requests", () => {
    const existing = makeEntry({ id: "old" })
    const result = apply([existing], "stream:open", {
      requestId: "new",
      source: "api",
      method: "sub",
      sessionId: "s-1",
    })

    expect(result.requests).toHaveLength(2)
    expect(reqAt(result.requests, 0).id).toBe("new")
    expect(reqAt(result.requests, 1).id).toBe("old")
  })

  it("caps requests at maxRequests and reports dropped count", () => {
    const existing = Array.from({ length: 5 }, (_, i) => makeEntry({ id: `e-${i}` }))
    const result = apply(existing, "stream:open", {
      requestId: "overflow",
      source: "api",
      method: "sub",
      sessionId: "s-1",
    }, 5)

    expect(result.requests).toHaveLength(5)
    expect(reqAt(result.requests, 0).id).toBe("overflow")
    expect(result.droppedCount).toBe(1)
  })
})

// ── stream:message ──────────────────────────────────────────────────────

describe("stream:message", () => {
  it("increments event count and total bytes", () => {
    const entry = makeEntry({ id: "r-1", streamEventCount: 3, streamTotalBytes: 100 })
    const result = apply([entry], "stream:message", {
      requestId: "r-1",
      dataSize: 50,
      seq: 4,
      timestamp: 2000,
    })

    const updated = reqAt(result.requests, 0)
    expect(updated.streamEventCount).toBe(4)
    expect(updated.streamTotalBytes).toBe(150)
  })

  it("stores StreamEventRecord with eventType", () => {
    const entry = makeEntry({ id: "r-1" })
    const result = apply([entry], "stream:message", {
      requestId: "r-1",
      dataSize: 32,
      seq: 1,
      eventType: "message",
      timestamp: 3000,
    })

    const events = reqAt(result.requests, 0).streamEvents!
    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({ seq: 1, dataSize: 32, timestamp: 3000, eventType: "message" })
  })

  it("omits eventType from record when absent", () => {
    const entry = makeEntry({ id: "r-1" })
    const result = apply([entry], "stream:message", {
      requestId: "r-1",
      dataSize: 10,
      seq: 0,
      timestamp: 1000,
    })

    expect(reqAt(result.requests, 0).streamEvents![0]).not.toHaveProperty("eventType")
  })

  it("does not modify non-matching requests", () => {
    const entry = makeEntry({ id: "r-1" })
    const other = makeEntry({ id: "r-2", streamEventCount: 5 })
    const result = apply([entry, other], "stream:message", {
      requestId: "r-1",
      dataSize: 10,
      seq: 1,
      timestamp: 1000,
    })

    const bystander = reqAt(result.requests, 1)
    expect(bystander.streamEventCount).toBe(5)
    expect(bystander.streamEvents).toBeUndefined()
  })

  it("caps streamEvents at 200, dropping oldest", () => {
    const existingEvents = Array.from({ length: 200 }, (_, i) => ({
      seq: i,
      dataSize: 1,
      timestamp: i,
    }))
    const entry = makeEntry({
      id: "r-1",
      streamEventCount: 200,
      streamTotalBytes: 200,
      streamEvents: existingEvents,
    })

    const result = apply([entry], "stream:message", {
      requestId: "r-1",
      dataSize: 99,
      seq: 200,
      timestamp: 9999,
    })

    const updated = reqAt(result.requests, 0)
    expect(updated.streamEvents).toHaveLength(200)
    // Oldest (seq=0) dropped, newest (seq=200) appended
    expect(updated.streamEvents![0]!.seq).toBe(1)
    expect(updated.streamEvents![199]!.seq).toBe(200)
    expect(updated.streamEvents![199]!.dataSize).toBe(99)
    // Count still increments (it's total, not capped)
    expect(updated.streamEventCount).toBe(201)
    expect(updated.streamTotalBytes).toBe(299)
  })
})

// ── stream:close ────────────────────────────────────────────────────────

describe("stream:close", () => {
  it("sets success status and complete streamStatus", () => {
    const entry = makeEntry({ id: "r-1", streamEventCount: 10, streamTotalBytes: 500 })
    const result = apply([entry], "stream:close", {
      requestId: "r-1",
      reason: "complete",
      eventCount: 10,
      totalBytes: 500,
      duration: 3200,
    })

    const updated = reqAt(result.requests, 0)
    expect(updated.status).toBe("success")
    expect(updated.streamStatus).toBe("complete")
    expect(updated.streamDuration).toBe(3200)
    expect(updated.streamEventCount).toBe(10)
    expect(updated.streamTotalBytes).toBe(500)
  })

  it("sets error status when reason is error", () => {
    const entry = makeEntry({ id: "r-1" })
    const result = apply([entry], "stream:close", {
      requestId: "r-1",
      reason: "error",
      duration: 100,
    })

    const updated = reqAt(result.requests, 0)
    expect(updated.status).toBe("error")
    expect(updated.streamStatus).toBe("error")
  })

  it("defaults reason to complete when missing", () => {
    const entry = makeEntry({ id: "r-1" })
    const result = apply([entry], "stream:close", {
      requestId: "r-1",
      duration: 50,
    })

    const updated = reqAt(result.requests, 0)
    expect(updated.status).toBe("success")
    expect(updated.streamStatus).toBe("complete")
  })

  it("uses fallback counts from entry when event omits them", () => {
    const entry = makeEntry({ id: "r-1", streamEventCount: 7, streamTotalBytes: 300 })
    const result = apply([entry], "stream:close", {
      requestId: "r-1",
      duration: 1000,
    })

    const updated = reqAt(result.requests, 0)
    expect(updated.streamEventCount).toBe(7)
    expect(updated.streamTotalBytes).toBe(300)
  })
})

// ── stream:error ────────────────────────────────────────────────────────

describe("stream:error", () => {
  it("sets error status and stores error message", () => {
    const entry = makeEntry({ id: "r-1" })
    const result = apply([entry], "stream:error", {
      requestId: "r-1",
      error: "Connection lost",
    })

    const updated = reqAt(result.requests, 0)
    expect(updated.status).toBe("error")
    expect(updated.streamStatus).toBe("error")
    expect(updated.error).toEqual({
      type: "StreamError",
      message: "Connection lost",
    })
  })

  it("uses default error message when error field is missing", () => {
    const entry = makeEntry({ id: "r-1" })
    const result = apply([entry], "stream:error", {
      requestId: "r-1",
    })

    expect(reqAt(result.requests, 0).error!.message).toBe("Stream error")
  })

  it("does not modify non-matching requests", () => {
    const target = makeEntry({ id: "r-1" })
    const bystander = makeEntry({ id: "r-2", status: "pending" })
    const result = apply([target, bystander], "stream:error", {
      requestId: "r-1",
      error: "fail",
    })

    expect(reqAt(result.requests, 0).status).toBe("error")
    expect(reqAt(result.requests, 1).status).toBe("pending")
  })
})
