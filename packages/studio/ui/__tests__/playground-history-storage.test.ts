/**
 * The Playground history as Studio keeps it for the project, and as a page
 * reads it back: it was lost with the page, so a call made a moment before
 * was gone, answer and all.
 */
import { describe, expect, it } from "vitest"

import { keptPlaygroundHistory, readPlaygroundHistory } from "../src/store/playground-history-storage"
import type { PlaygroundHistoryEntry } from "../src/store/types-ui"

function entry(overrides: Partial<PlaygroundHistoryEntry> = {}): PlaygroundHistoryEntry {
  return {
    id: "e1",
    rid: "r1",
    source: "api",
    group: "users",
    method: "list",
    variables: "{}",
    headers: "{}",
    mode: "direct",
    timestamp: 1,
    status: "success",
    statusCode: 200,
    response: [{ id: 1 }],
    ...overrides,
  }
}

/* What a page reads back after Studio kept what the page sent. */
function roundTrip(entries: PlaygroundHistoryEntry[]): PlaygroundHistoryEntry[] {
  return readPlaygroundHistory(JSON.parse(JSON.stringify(keptPlaygroundHistory(entries))))
}

describe("the Playground history across a reload", () => {
  it("comes back as it was kept", () => {
    expect(roundTrip([entry()])).toEqual([entry()])
  })

  it("shows a call still running at the reload as interrupted", () => {
    expect(roundTrip([entry({ status: "pending", response: undefined })])[0]).toMatchObject({
      status: "error",
      response: "The page was reloaded before the answer arrived.",
    })
  })

  it("keeps a note in place of an answer too large to store", () => {
    expect(String(roundTrip([entry({ response: "x".repeat(100_000) })])[0]?.response)).toContain("too large to keep")
  })

  it("starts empty when what was kept is not a history, and leaves out an entry it cannot read", () => {
    expect(readPlaygroundHistory({ not: "a list" })).toEqual([])
    expect(readPlaygroundHistory([{ id: 1 }, entry()])).toEqual([entry()])
  })
})
