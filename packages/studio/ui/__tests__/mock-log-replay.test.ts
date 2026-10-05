/**
 * A page takes in the requests Studio's mocks answered, which Studio replays
 * on connect as it keeps them — the worker's event with its mock and the time
 * it was shown, without a live event's envelope; a page that reconnects
 * counts none of them twice.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { replayMockEvents } from "../src/socket/replay-mock-events";
import { useMockStore } from "../src/store/mock-slice";

const EVENTS = [
  {
    type: "mock:request:start",
    timestamp: 1,
    serverId: "petstore",
    requestId: "req_1",
    httpMethod: "GET",
    path: "/pets",
    group: "pets",
    endpoint: "list",
  },
  {
    type: "mock:request:end",
    timestamp: 2,
    serverId: "petstore",
    requestId: "req_1",
    status: 200,
    duration: 3,
  },
  {
    type: "mock:request:start",
    timestamp: 3,
    serverId: "petstore",
    requestId: "req_2",
    httpMethod: "POST",
    path: "/pets",
    group: "pets",
    endpoint: "create",
    source: "scenario",
  },
];

beforeEach(() => {
  useMockStore.setState({ logs: [] });
});

describe("the mocks' logs Studio replays", () => {
  it("are shown on a page that loads, each request once, with how it ended", () => {
    replayMockEvents(EVENTS);

    const logs = useMockStore.getState().logs;
    expect(logs.map((log) => [log.id, log.status, log.timestamp])).toEqual([
      ["req_2", undefined, 3],
      ["req_1", 200, 1],
    ]);
  });

  it("keep what answered each request as it arrived, when the mock said", () => {
    replayMockEvents([...EVENTS, { ...EVENTS[0], requestId: "req_3", source: "nonsense" }]);

    expect(useMockStore.getState().logs.map((log) => [log.id, log.source])).toEqual([
      ["req_3", undefined],
      ["req_2", "scenario"],
      ["req_1", undefined],
    ]);
  });

  it("add nothing twice to a page that reconnects, and end a request that ended meanwhile", () => {
    replayMockEvents(EVENTS);
    const ended = { ...EVENTS[2], type: "mock:request:end", status: 201, duration: 5 };

    replayMockEvents([...EVENTS, ended]);

    const logs = useMockStore.getState().logs;
    expect(logs.map((log) => [log.id, log.status])).toEqual([
      ["req_2", 201],
      ["req_1", 200],
    ]);
  });
});
