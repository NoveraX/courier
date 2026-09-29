/**
 * @vitest-environment jsdom
 */
/**
 * The status bar's "N dropped" counts the requests the in-memory cap pushed
 * out, once each: events that change nothing, arriving after the cap was
 * reached, must not add to it.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { StudioEvent } from "@/store";
import { useStudioStore } from "@/store";

type Event = StudioEvent & Record<string, unknown>;

function start(i: number): Event {
  return {
    id: `r${i}`,
    type: "request:start",
    timestamp: i,
    sessionId: "s",
    source: "api",
    method: "list",
  };
}

function fetchEnd(i: number): Event {
  return {
    id: `r${i}`,
    type: "http:fetch:end",
    timestamp: i,
    sessionId: "s",
    requestId: `r${i}`,
    status: 200,
  };
}

beforeEach(() => {
  const { settings } = useStudioStore.getState();
  useStudioStore.setState({
    requests: [],
    droppedRequests: 0,
    paused: false,
    settings: { ...settings, maxRequests: 10 },
  });
});

describe("the dropped-requests counter", () => {
  it("counts each request the cap drops once", () => {
    const events: Event[] = [];
    for (let i = 0; i < 25; i++) events.push(start(i), fetchEnd(i));

    useStudioStore.getState().handleEvents(events);

    expect(useStudioStore.getState().requests).toHaveLength(10);
    expect(useStudioStore.getState().droppedRequests).toBe(15);
  });

  it("stays put while events that change nothing keep arriving", () => {
    const events: Event[] = [];
    for (let i = 0; i < 11; i++) events.push(start(i));
    for (const event of events) useStudioStore.getState().handleEvents([event]);

    for (let i = 0; i < 11; i++) useStudioStore.getState().handleEvents([fetchEnd(i)]);

    expect(useStudioStore.getState().droppedRequests).toBe(1);
  });
});
