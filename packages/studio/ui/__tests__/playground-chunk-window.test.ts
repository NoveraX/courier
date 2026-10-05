/**
 * @vitest-environment jsdom
 *
 * The events of a stream the Playground runs: it keeps the last 500, counts
 * the earlier ones it let go, and its Messages figure counts all of them, so
 * a stream of a few thousand events does not make every new one slower to
 * show.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/socket", () => ({ getSocket: () => ({ emit: vi.fn() }) }));

import { playgroundCells } from "@/features/playground/playground-cells";
import { useStudioStore } from "../src/store";
import { MAX_SHOWN_CHUNKS } from "../src/store/playground-actions";
import type { PlaygroundHistoryEntry } from "../src/store/types-ui";

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
    if (!entry) throw new Error("The stream is not in the history");
    const cells = playgroundCells({ entry, row: undefined, now: 2, slowMs: 500 });
    expect(cells.find((cell) => cell.label === "Messages")?.value).toBe(
      String(MAX_SHOWN_CHUNKS + 100),
    );
  });
});
