/**
 * A mock's key is the developer's name, and it is also its id in the UI's
 * mock store. The store finds a mock among its own entries only, so a key
 * such as `toString` or `constructor` is a mock like any other.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { handleMockEvent } from "../src/store/handle-mock-events";
import { useMockStore } from "../src/store/mock-slice";

function connect(serverId: string, extra: Record<string, unknown> = {}): void {
  handleMockEvent({
    type: "mock:server:connect",
    serverId,
    name: serverId,
    port: 7001,
    url: "",
    managed: true,
    processStatus: "declared",
    origin: "studio",
    ...extra,
  });
}

beforeEach(() => {
  useMockStore.getState().resetMockState();
});

describe("a mock whose key names an inherited member", () => {
  it("is listed when Studio declares it, and updated when Studio says more", () => {
    connect("toString");
    connect("toString", { processStatus: "running", port: 7002 });

    const servers = useMockStore.getState().servers;
    expect(Object.hasOwn(servers, "toString")).toBe(true);
    expect(servers.toString).toMatchObject({
      serverId: "toString",
      processStatus: "running",
      port: 7002,
    });
  });

  it("is removed once courier.mocks.ts stops declaring it", () => {
    connect("constructor");
    handleMockEvent({ type: "mock:server:disconnect", serverId: "constructor" });

    expect(Object.hasOwn(useMockStore.getState().servers, "constructor")).toBe(false);
  });

  it("changes nothing when an event names a mock that is not listed", () => {
    handleMockEvent({
      type: "mock:store:changes",
      serverId: "valueOf",
      seq: 1,
      whole: true,
      collections: [{ name: "users", count: 0, records: [] }],
      removed: [],
    });
    handleMockEvent({
      type: "mock:scenario:active",
      serverId: "hasOwnProperty",
      scenario: "empty",
    });
    useMockStore.getState().updateServer("isPrototypeOf", { port: 7003 });

    expect(useMockStore.getState().servers).toEqual({});
  });

  it("is the active mock when it is the only one", () => {
    connect("valueOf");

    expect(useMockStore.getState().activeServerId).toBe("valueOf");
    expect(Object.keys(useMockStore.getState().servers)).toEqual(["valueOf"]);
  });
});
