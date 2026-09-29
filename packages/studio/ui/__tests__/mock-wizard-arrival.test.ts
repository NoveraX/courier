/**
 * After Studio adds the mocks, the wizard follows each key until Studio
 * lists it, as it does once it has loaded the edited file
 * (`mock:server:connect`), and says so when one is late.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { handleMockEvent } from "../src/store/handle-mock-events";
import { useMockStore } from "../src/store/mock-slice";
import { ARRIVAL_PATIENCE_MS, mockArrival } from "../src/views/mocks/wizard/mock-arrival";

function connect(serverId: string, processStatus = "running"): void {
  handleMockEvent({
    type: "mock:server:connect",
    serverId,
    name: serverId,
    port: 7001,
    url: "http://127.0.0.1:7001",
    managed: true,
    processStatus,
    origin: "studio",
  });
}

beforeEach(() => {
  useMockStore.getState().resetMockState();
});

describe("the arrival of the mocks added", () => {
  it("lists each mock as Studio lists it, and waits for the rest", () => {
    const keys = ["apiMock", "billingMock"];
    expect(mockArrival(useMockStore.getState().servers, keys, 0).pending).toEqual(keys);

    connect("billingMock", "starting");
    const arrival = mockArrival(useMockStore.getState().servers, keys, 1_000);

    expect(arrival.listed.map((server) => [server.serverId, server.processStatus])).toEqual([
      ["billingMock", "starting"],
    ]);
    expect(arrival.pending).toEqual(["apiMock"]);
    expect(arrival.overdue).toBe(false);
  });

  it("says a mock is late only once the patience has run out", () => {
    const servers = useMockStore.getState().servers;

    expect(mockArrival(servers, ["apiMock"], ARRIVAL_PATIENCE_MS - 1).overdue).toBe(false);
    expect(mockArrival(servers, ["apiMock"], ARRIVAL_PATIENCE_MS).overdue).toBe(true);
    connect("apiMock");
    expect(
      mockArrival(useMockStore.getState().servers, ["apiMock"], ARRIVAL_PATIENCE_MS).overdue,
    ).toBe(false);
  });

  it("does not take an inherited name for a mock Studio lists", () => {
    const arrival = mockArrival(useMockStore.getState().servers, ["toString", "constructor"], 0);

    expect(arrival.listed).toEqual([]);
    expect(arrival.pending).toEqual(["toString", "constructor"]);
  });
});
