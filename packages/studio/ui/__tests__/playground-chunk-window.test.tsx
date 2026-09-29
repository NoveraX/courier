/**
 * @vitest-environment jsdom
 *
 * The events of a stream the Playground runs. Each one copied the whole list
 * kept so far, and the list grew for as long as the stream ran: a stream of
 * a few thousand events made every new one slower to show. The Playground
 * now keeps the last 500, says how many earlier ones it let go, and counts
 * all of them.
 */
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/socket", () => ({ getSocket: () => ({ emit: vi.fn() }) }));

import { useStudioStore } from "../src/store";
import { MAX_SHOWN_CHUNKS } from "../src/store/playground-actions";
import type { PlaygroundHistoryEntry } from "../src/store/types-ui";
import { StreamEventsTab } from "../src/views/playground/stream-events-tab";

afterEach(() => {
  useStudioStore.getState().clearPlaygroundHistory();
});

function streaming(): PlaygroundHistoryEntry {
  return {
    id: "entry-1",
    rid: "rid-1",
    source: "api",
    group: "live",
    method: "ticks",
    variables: "{}",
    headers: "{}",
    mode: "direct",
    timestamp: 1,
    status: "pending",
    transport: "sse",
    streamStatus: "connecting",
  };
}

describe("a long stream in the Playground", () => {
  it("keeps its last events and counts the ones it let go", () => {
    const store = useStudioStore.getState();
    store.addPlaygroundEntry(streaming());

    for (let n = 1; n <= MAX_SHOWN_CHUNKS + 100; n++) {
      store.appendPlaygroundChunk("rid-1", { kind: "sse-event", event: n });
    }
    const [entry] = useStudioStore.getState().playgroundHistory;

    expect(entry?.chunks).toHaveLength(MAX_SHOWN_CHUNKS);
    expect(entry?.chunks?.[0]).toMatchObject({ event: 101 });
    expect(entry?.chunks?.at(-1)).toMatchObject({ event: MAX_SHOWN_CHUNKS + 100 });
    expect(entry?.chunksDropped).toBe(100);
  });

  it("says how many earlier events it does not show", () => {
    const store = useStudioStore.getState();
    store.addPlaygroundEntry(streaming());
    for (let n = 1; n <= MAX_SHOWN_CHUNKS + 2; n++) {
      store.appendPlaygroundChunk("rid-1", { kind: "sse-event", event: n });
    }
    const [entry] = useStudioStore.getState().playgroundHistory;
    if (!entry) throw new Error("The stream is not in the history");

    render(<StreamEventsTab entry={entry} />);

    expect(screen.getByText(/2 earlier events are not shown; the last 500 are\./)).toBeTruthy();
  });
});
