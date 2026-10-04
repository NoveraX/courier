/**
 * @vitest-environment jsdom
 *
 * A stream or channel the Playground opened that fails says why: the reason
 * the runtime gave, not only that no event came.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/socket", () => ({ getSocket: () => ({ emit: vi.fn() }) }));

import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import { StreamEventsTab } from "@/views/playground/stream-events-tab";

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

afterEach(cleanup);

describe("a Playground stream that failed", () => {
  it("says why, when nothing came", () => {
    const reason = "Validation failed (variables): Too small: expected number to be >=100";
    render(<StreamEventsTab entry={entry({ response: reason })} />);

    expect(screen.getByRole("alert").textContent).toBe(reason);
  });

  it("says why above what it delivered first", () => {
    render(
      <StreamEventsTab
        entry={entry({
          response: "Stream failed",
          chunks: [{ kind: "sse-event", event: { data: { n: 1 } } }],
        })}
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe("Stream failed");
  });

  it("raises nothing while it streams", () => {
    render(<StreamEventsTab entry={entry({ status: "pending", streamStatus: "streaming" })} />);

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
