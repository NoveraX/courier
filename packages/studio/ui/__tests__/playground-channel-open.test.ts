/**
 * @vitest-environment jsdom
 *
 * A channel the Playground opened shows as open once it connects, though it
 * says nothing on join: it stayed "connecting" until its first message.
 */
import { afterEach, describe, expect, it } from "vitest";

import { isPlaygroundChunkPayload } from "@/socket/playground-guards";
import { useStudioStore } from "@/store";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";

const CHANNEL: PlaygroundHistoryEntry = {
  id: "entry-1",
  rid: "rid-1",
  source: "api",
  group: "live",
  method: "room",
  variables: '{"room":"general","nick":"ada"}',
  headers: "{}",
  mode: "direct",
  timestamp: 1,
  status: "pending",
  transport: "ws",
  streamStatus: "connecting",
};

afterEach(() => {
  useStudioStore.getState().clearPlaygroundHistory();
});

describe("a channel the Playground opened", () => {
  it("shows as open once it connects, with nothing listed for it", () => {
    const store = useStudioStore.getState();
    store.addPlaygroundEntry(CHANNEL);
    const frame = { rid: "rid-1", chunk: { kind: "ws-open" } };

    expect(isPlaygroundChunkPayload(frame)).toBe(true);
    if (isPlaygroundChunkPayload(frame)) store.appendPlaygroundChunk(frame.rid, frame.chunk);

    const [entry] = useStudioStore.getState().playgroundHistory;
    expect(entry?.streamStatus).toBe("streaming");
    expect(entry?.chunks ?? []).toEqual([]);
  });
});
