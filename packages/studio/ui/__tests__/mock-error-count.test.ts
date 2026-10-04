/**
 * A mock's error count is the errors its callers got: an error status it
 * answered with — an override's `rejects(500)`, a scenario's outage — as well
 * as a handler that threw.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { handleMockEvent } from "../src/store/handle-mock-events";
import { useMockStore } from "../src/store/mock-slice";

function answered(requestId: string, status: number): void {
  handleMockEvent({
    type: "mock:request:start",
    serverId: "apiMock",
    requestId,
    httpMethod: "GET",
    path: "/posts/broken",
    group: "posts",
    endpoint: "broken",
    timestamp: 1,
  });
  handleMockEvent({
    type: "mock:request:end",
    serverId: "apiMock",
    requestId,
    status,
    duration: 1,
  });
}

beforeEach(() => {
  useMockStore.setState({ logs: [] });
  for (const id of Object.keys(useMockStore.getState().servers)) {
    useMockStore.getState().removeServer(id);
  }
  handleMockEvent({
    type: "mock:server:connect",
    serverId: "apiMock",
    name: "apiMock",
    port: 7001,
    url: "http://localhost:7001",
    managed: true,
    processStatus: "running",
    origin: "studio",
  });
});

describe("a mock's error count", () => {
  it("counts the error statuses it answered with", () => {
    answered("r1", 500);
    answered("r2", 503);
    answered("r3", 200);

    expect(useMockStore.getState().servers.apiMock).toMatchObject({
      requestsServed: 3,
      errorCount: 2,
    });
  });
});
