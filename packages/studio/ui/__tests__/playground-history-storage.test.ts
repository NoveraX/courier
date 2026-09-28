/**
 * @vitest-environment jsdom
 *
 * The Playground history across a reload: it was lost with the page, so a
 * call made a moment before was gone, answer and all.
 */
import { beforeEach, describe, expect, it } from "vitest"

import {
  loadPlaygroundHistory,
  PLAYGROUND_HISTORY_KEY,
  savePlaygroundHistory,
} from "../src/store/playground-history-storage"
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

beforeEach(() => {
  localStorage.clear()
})

describe("the Playground history across a reload", () => {
  it("comes back as it was kept", () => {
    savePlaygroundHistory([entry()])

    expect(loadPlaygroundHistory()).toEqual([entry()])
  })

  it("shows a call still running at the reload as interrupted", () => {
    savePlaygroundHistory([entry({ status: "pending", response: undefined })])

    expect(loadPlaygroundHistory()[0]).toMatchObject({
      status: "error",
      response: "The page was reloaded before the answer arrived.",
    })
  })

  it("keeps a note in place of an answer too large to store", () => {
    savePlaygroundHistory([entry({ response: "x".repeat(100_000) })])

    expect(String(loadPlaygroundHistory()[0]?.response)).toContain("too large to keep")
  })

  it("starts empty when what was kept cannot be read", () => {
    localStorage.setItem(PLAYGROUND_HISTORY_KEY, "{not json")

    expect(loadPlaygroundHistory()).toEqual([])
  })
})
