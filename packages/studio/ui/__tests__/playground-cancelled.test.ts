/**
 * @vitest-environment jsdom
 */
/**
 * A Playground call cancelled before its answer came stays cancelled — a
 * status of its own, not a failure: an answer the runtime sends after the
 * cancel does not take its place, and the run reads as cancelled wherever
 * it is shown and after a reload.
 */
import { afterEach, describe, expect, it } from "vitest";

import { cancelledRun } from "../src/features/playground/cancelled-run";
import { entryPayloadView } from "../src/features/playground/entry-view";
import { playgroundCells } from "../src/features/playground/playground-cells";
import { answerMark } from "../src/screens/playground/answer-mark";
import { useStudioStore } from "../src/store";
import { readPlaygroundHistory } from "../src/store/playground-history-storage";
import type { PlaygroundHistoryEntry } from "../src/store/types-ui";

afterEach(() => {
  useStudioStore.getState().clearPlaygroundHistory();
});

const ENTRY: PlaygroundHistoryEntry = {
  id: "entry-cancelled",
  rid: "rid-cancelled",
  source: "api",
  group: "reports",
  method: "slow",
  variables: "{}",
  headers: "{}",
  mode: "direct",
  timestamp: 1_000,
  status: "pending",
};

function shown(): PlaygroundHistoryEntry | null {
  return useStudioStore.getState().playgroundActiveResponse;
}

/* What the toolbar's Cancel does to the run shown. */
function cancel(entry: PlaygroundHistoryEntry, now: number): void {
  useStudioStore.getState().updatePlaygroundEntry(entry.id, cancelledRun(entry, now));
}

describe("a Playground call cancelled before its answer came", () => {
  it("is cancelled, and as long as it ran until the cancel", () => {
    useStudioStore.getState().addPlaygroundEntry(ENTRY);

    cancel(ENTRY, 1_250);

    expect(shown()).toMatchObject({ status: "cancelled", duration: 250 });
    expect(shown()?.response).toBeUndefined();
  });

  it("keeps being cancelled when an answer, its end or an error arrives after", () => {
    const store = useStudioStore.getState();
    store.addPlaygroundEntry(ENTRY);
    cancel(ENTRY, 1_250);

    store.appendPlaygroundChunk(ENTRY.rid, {
      kind: "http-result",
      status: 200,
      data: { ready: true },
    });
    store.endPlayground(ENTRY.rid, { durationMs: 400 });
    store.errorPlayground(ENTRY.rid, { message: "aborted" });

    expect(shown()).toMatchObject({ status: "cancelled", duration: 250 });
    expect(shown()?.statusCode).toBeUndefined();
    expect(shown()?.response).toBeUndefined();
    expect(useStudioStore.getState().playgroundHistory[0]).toEqual(shown());
  });

  it("is ended as cancelled by Studio's end of a run that was cancelled", () => {
    const store = useStudioStore.getState();
    store.addPlaygroundEntry(ENTRY);

    store.endPlayground(ENTRY.rid, { durationMs: 120, cancelled: true });

    expect(shown()).toMatchObject({ status: "cancelled", duration: 120 });
  });

  it("leaves a stream that was stopped complete, not cancelled", () => {
    const store = useStudioStore.getState();
    const stream: PlaygroundHistoryEntry = {
      ...ENTRY,
      transport: "sse",
      streamStatus: "streaming",
    };
    store.addPlaygroundEntry(stream);

    store.endPlayground(stream.rid, { durationMs: 900, cancelled: true });

    expect(shown()).toMatchObject({ status: "success", streamStatus: "complete" });
  });

  it("reads as cancelled where the run is shown", () => {
    const run: PlaygroundHistoryEntry = { ...ENTRY, status: "cancelled", duration: 250 };

    expect(answerMark(run, undefined)).toEqual({ text: "cancelled", tone: "subtle" });
    expect(entryPayloadView(run).empty?.title).toBe("Cancelled");
    expect(
      playgroundCells({ entry: run, row: undefined, now: 2_000, slowMs: 1_000 })[0],
    ).toMatchObject({ value: "Cancelled" });
  });

  it("is read back as cancelled after a reload", () => {
    const run: PlaygroundHistoryEntry = { ...ENTRY, status: "cancelled", duration: 250 };

    expect(readPlaygroundHistory(JSON.parse(JSON.stringify([run])))).toEqual([run]);
  });
});
