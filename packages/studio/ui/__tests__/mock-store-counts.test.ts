/**
 * The Mocks dashboard's Records and Collections follow the store as the
 * mock server last reported it, not only as it was when the server connected.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { handleMockEvent } from "../src/store/handle-mock-events";
import { useMockStore } from "../src/store/mock-slice";

const records = (count: number) => Array.from({ length: count }, (_, id) => ({ id }));

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
    collections: [{ name: "users", count: 20, records: records(20) }],
    storeSeq: 0,
  });
});

function report(seq: number, collections: unknown[]) {
  return {
    type: "mock:store:changes",
    serverId: "apiMock",
    seq,
    whole: false,
    collections,
    removed: [],
  };
}

describe("the dashboard's store counts", () => {
  it("count a record the store gained after the server connected", () => {
    const edits = { removed: [], changed: [], added: [{ id: 20 }] };

    handleMockEvent(report(1, [{ name: "users", count: 21, edits }]));

    expect(useMockStore.getState().servers.apiMock).toMatchObject({
      recordCount: 21,
      collectionCount: 1,
    });
  });

  it("follow a change to one collection among others", () => {
    const edits = { removed: [], changed: [], added: [{ id: 20 }, { id: 21 }] };

    handleMockEvent(report(1, [{ name: "posts", count: 4, records: records(4) }]));
    handleMockEvent(report(2, [{ name: "users", count: 22, edits }]));

    expect(useMockStore.getState().servers.apiMock).toMatchObject({
      recordCount: 26,
      collectionCount: 2,
    });
  });
});
