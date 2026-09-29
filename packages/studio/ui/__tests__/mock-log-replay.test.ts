/**
 * A page takes in the requests Studio's mocks answered, which Studio replays
 * on connect; a page that reconnects counts none of them twice.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { replayMockEvents } from "../src/socket/replay-mock-events";
import { useMockStore } from "../src/store/mock-slice";

const EVENTS = [
  {
    id: "e1",
    type: "mock:request:start",
    timestamp: 1,
    sessionId: "mock-manager",
    serverId: "petstore",
    requestId: "req_1",
    httpMethod: "GET",
    path: "/pets",
    group: "pets",
    endpoint: "list",
  },
  {
    id: "e2",
    type: "mock:request:end",
    timestamp: 2,
    sessionId: "mock-manager",
    serverId: "petstore",
    requestId: "req_1",
    status: 200,
    duration: 3,
  },
  {
    id: "e3",
    type: "mock:request:start",
    timestamp: 3,
    sessionId: "mock-manager",
    serverId: "petstore",
    requestId: "req_2",
    httpMethod: "POST",
    path: "/pets",
    group: "pets",
    endpoint: "create",
  },
];

beforeEach(() => {
  useMockStore.setState({ logs: [] });
});

describe("the mocks' logs Studio replays", () => {
  it("are shown on a page that loads, each request once, with how it ended", () => {
    replayMockEvents(EVENTS);

    const logs = useMockStore.getState().logs;
    expect(logs.map((log) => [log.id, log.status])).toEqual([
      ["req_2", undefined],
      ["req_1", 200],
    ]);
  });

  it("add nothing twice to a page that reconnects, and end a request that ended meanwhile", () => {
    replayMockEvents(EVENTS);
    const ended = { ...EVENTS[2], id: "e4", type: "mock:request:end", status: 201, duration: 5 };

    replayMockEvents([...EVENTS, ended]);

    const logs = useMockStore.getState().logs;
    expect(logs.map((log) => [log.id, log.status])).toEqual([
      ["req_2", 201],
      ["req_1", 200],
    ]);
  });
});
