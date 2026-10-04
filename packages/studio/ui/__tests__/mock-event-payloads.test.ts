/**
 * Mock events whose fields have another shape than the store's types: each
 * was cast unread, so the page listed a port of text, or routes without the
 * counts its views compute with.
 */
import { afterEach, describe, expect, it } from "vitest";

import { handleMockEvent } from "../src/store/handle-mock-events";
import { useMockStore } from "../src/store/mock-slice";

afterEach(() => {
  useMockStore.getState().resetMockState();
});

function connect(fields: Record<string, unknown>): void {
  handleMockEvent({
    type: "mock:server:connect",
    serverId: "api",
    id: "e1",
    timestamp: 1,
    ...fields,
  });
}

describe("a mock event with fields of another shape", () => {
  it("keeps the store's types for a server that connects", () => {
    connect({ port: "7001", managed: "yes", processStatus: "flying", routes: [{ group: 1 }] });

    const server = useMockStore.getState().servers.api;
    expect(server).toMatchObject({ port: 0, managed: false, processStatus: "running", routes: [] });
  });

  it("lists no routes, collections or scenarios it cannot read", () => {
    connect({});

    handleMockEvent({ type: "mock:route:list", serverId: "api", routes: [{ group: "users" }] });
    handleMockEvent({ type: "mock:store:snapshot", serverId: "api", collections: "users" });
    handleMockEvent({ type: "mock:scenario:list", serverId: "api", scenarios: [{ name: 1 }] });

    const server = useMockStore.getState().servers.api;
    expect([server?.routes, server?.collections, server?.scenarios]).toEqual([[], [], []]);
  });
});
