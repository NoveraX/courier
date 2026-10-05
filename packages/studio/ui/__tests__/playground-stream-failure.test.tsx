/**
 * @vitest-environment jsdom
 *
 * A stream or channel the Playground opened that fails says why: the reason
 * the runtime gave, not only that no event came — announced while the
 * runtime has not reported the call, and on the stream's messages once it
 * has, above what it delivered first.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/socket", () => ({ getSocket: () => ({ emit: vi.fn() }) }));

import { ResponseContent } from "@/screens/playground/response-content";
import type { RequestEntry } from "@/store/types";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import { requestEntry } from "./request-entry-fixture";

function entry(overrides: Partial<PlaygroundHistoryEntry>): PlaygroundHistoryEntry {
  return {
    id: "e1",
    rid: "e1",
    source: "api",
    group: "live",
    method: "ticks",
    variables: '{"every":0}',
    headers: "{}",
    mode: "direct",
    timestamp: 1,
    status: "error",
    transport: "sse",
    streamStatus: "error",
    ...overrides,
  };
}

function show(run: PlaygroundHistoryEntry, row?: RequestEntry): void {
  render(
    <ResponseContent
      entry={run}
      row={row}
      tab="messages"
      payload={{ mode: "tree", onMode: () => {} }}
      now={Date.now()}
      sendingLabel=""
      onCancel={() => {}}
    />,
  );
}

afterEach(cleanup);

describe("a Playground stream that failed", () => {
  it("says why, when nothing came", () => {
    const reason = "Validation failed (variables): Too small: expected number to be >=100";

    show(entry({ response: reason }));

    expect(screen.getByRole("alert").textContent).toBe(reason);
  });

  it("says why above what it delivered first", () => {
    const row = requestEntry({
      id: "pg_e1",
      transport: "sse",
      status: "error",
      streamStatus: "error",
      error: { type: "unknown", message: "Stream failed" },
      streamEvents: [
        { seq: 1, timestamp: 2, eventType: "message", dataSize: 7, dataPreview: '{"n":1}' },
      ],
      streamEventCount: 1,
    });

    show(entry({ response: "Stream failed" }), row);

    expect(screen.getByText("Closed with an error")).toBeTruthy();
    expect(screen.getByText(/^Stream failed · /)).toBeTruthy();
  });

  it("raises nothing while it streams", () => {
    show(entry({ status: "pending", streamStatus: "streaming" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Connecting…")).toBeTruthy();
  });
});
