/**
 * The Mocks dashboard's Records and Collections follow the store as the
 * mock server last sent it, not only as it was when the server connected.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { handleMockEvent } from "../src/store/handle-mock-events";
import { useMockStore } from "../src/store/mock-slice";

const users = (count: number) => ({ name: "users", count, records: [] });

beforeEach(() => {
  for (const id of Object.keys(useMockStore.getState().servers)) {
    useMockStore.getState().removeServer(id);
  }
  handleMockEvent({
    type: "mock:server:connect",
    serverId: "apiMock",
    name: "apiMock",
    processStatus: "running",
    recordCount: 20,
    collectionCount: 1,
    collections: [users(20)],
  });
});

describe("the dashboard's store counts", () => {
  it("count a record the store gained after the server connected", () => {
    handleMockEvent({ type: "mock:store:snapshot", serverId: "apiMock", collections: [users(21)] });

    expect(useMockStore.getState().servers.apiMock).toMatchObject({ recordCount: 21, collectionCount: 1 });
  });

  it("follow a change to one collection", () => {
    handleMockEvent({
      type: "mock:store:snapshot",
      serverId: "apiMock",
      collections: [users(21), { name: "posts", count: 4, records: [] }],
    });
    handleMockEvent({ type: "mock:store:change", serverId: "apiMock", collection: "users", count: 22 });

    expect(useMockStore.getState().servers.apiMock).toMatchObject({ recordCount: 26, collectionCount: 2 });
  });
});
