/**
 * @vitest-environment jsdom
 */
/**
 * Pausing holds new requests out of the list until recording resumes, when
 * they join it on top; the ones already shown still end. Dropping every
 * event while paused left a stream that ended during the pause pending for
 * good, and dropping the new requests lost them.
 */
import { beforeEach, describe, expect, it } from "vitest";

import type { StudioEvent } from "@/store";
import { useStudioStore } from "@/store";

type Event = StudioEvent & Record<string, unknown>;

function event(type: string, id: string, fields: Record<string, unknown> = {}): Event {
  return {
    id,
    type: type as Event["type"],
    timestamp: 1,
    sessionId: "s",
    requestId: id,
    ...fields,
  };
}

const entry = (id: string) => useStudioStore.getState().requests.find((r) => r.id === id);
const ids = (list: readonly { id: string }[]) => list.map((r) => r.id);

beforeEach(() => {
  useStudioStore.setState({
    requests: [],
    heldRequests: [],
    droppedRequests: 0,
    paused: false,
    shownSession: null,
  });
  useStudioStore
    .getState()
    .handleEvents([
      event("stream:open", "s1", { source: "api", method: "ticks", transport: "sse" }),
      event("request:start", "r1", { source: "api", method: "slow" }),
    ]);
  useStudioStore.getState().togglePaused();
});

describe("while recording is paused", () => {
  it("ends a stream that ends", () => {
    useStudioStore
      .getState()
      .handleEvents([
        event("stream:message", "s1", { dataSize: 4, seq: 1 }),
        event("stream:close", "s1", { reason: "complete", eventCount: 20, duration: 900 }),
      ]);

    expect(entry("s1")).toMatchObject({
      status: "success",
      streamStatus: "complete",
      streamEventCount: 20,
    });
  });

  it("ends a request that ends", () => {
    useStudioStore.getState().handleEvents([event("request:end", "r1", { status: 200 })]);

    expect(entry("r1")?.status).toBe("success");
  });

  it("shows no new request", () => {
    useStudioStore
      .getState()
      .handleEvents([
        event("request:start", "r2", { source: "api", method: "list" }),
        event("stream:open", "s2", { source: "api", method: "ticks", transport: "sse" }),
        event("request:end", "r2", { status: 200 }),
      ]);

    expect(
      useStudioStore
        .getState()
        .requests.map((r) => r.id)
        .sort(),
    ).toEqual(["r1", "s1"]);
  });
});

describe("the requests that begin while recording is paused", () => {
  it("are held out of the list, and end there", () => {
    useStudioStore
      .getState()
      .handleEvents([
        event("request:start", "r2", { source: "api", method: "list", timestamp: 5 }),
        event("request:end", "r2", { status: 200 }),
      ]);

    expect(ids(useStudioStore.getState().requests).sort()).toEqual(["r1", "s1"]);
    expect(useStudioStore.getState().heldRequests).toMatchObject([{ id: "r2", status: "success" }]);
  });

  it("join the list on top once recording resumes", () => {
    useStudioStore
      .getState()
      .handleEvents([
        event("request:start", "r2", { source: "api", method: "list", timestamp: 5 }),
      ]);

    useStudioStore.getState().togglePaused();

    expect(ids(useStudioStore.getState().requests)[0]).toBe("r2");
    expect(useStudioStore.getState().requests).toHaveLength(3);
    expect(useStudioStore.getState().heldRequests).toEqual([]);
  });

  it("do not hold a request the list shows a second time", () => {
    useStudioStore
      .getState()
      .handleEvents([event("request:start", "r1", { source: "api", method: "slow" })]);

    expect(useStudioStore.getState().heldRequests).toEqual([]);
  });

  it("are not held while a saved session is shown, nor kept once the log is cleared", () => {
    useStudioStore
      .getState()
      .handleEvents([event("request:start", "r2", { source: "api", method: "list" })]);
    useStudioStore.getState().clearRequests();
    expect(useStudioStore.getState().heldRequests).toEqual([]);

    useStudioStore.getState().showSession({ id: "saved", name: "Saved" }, []);
    useStudioStore
      .getState()
      .handleEvents([event("request:start", "r3", { source: "api", method: "list" })]);

    expect(useStudioStore.getState().heldRequests).toEqual([]);
    expect(useStudioStore.getState().requests).toEqual([]);
  });

  it("are held when Studio replays them to a page that reconnects during the pause", () => {
    useStudioStore
      .getState()
      .replayEvents([
        event("request:start", "r1", { source: "api", method: "slow" }),
        event("request:start", "r9", { source: "api", method: "list", timestamp: 9 }),
      ]);

    expect(ids(useStudioStore.getState().heldRequests)).toEqual(["r9"]);
    expect(ids(useStudioStore.getState().requests).sort()).toEqual(["r1", "s1"]);
  });
});
