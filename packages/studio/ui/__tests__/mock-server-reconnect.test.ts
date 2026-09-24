/**
 * What the UI shows of a managed mock as its state changes: where it listens
 * now, why it crashed, its own tally of requests and errors across state
 * updates, and its removal once the config no longer declares it.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { handleMockEvent } from "../src/store/handle-mock-events";
import { handleServerConnect } from "../src/store/handle-mock-server-events";
import { useMockStore } from "../src/store/mock-slice";

const declared = {
  type: "mock:server:connect",
  serverId: "apiMock",
  name: "apiMock",
  port: 7001,
  url: "",
  managed: true,
  processStatus: "declared",
  origin: "studio",
};

beforeEach(() => {
  for (const id of Object.keys(useMockStore.getState().servers)) {
    useMockStore.getState().removeServer(id);
  }
});

describe("a managed mock in the UI", () => {
  it("shows where it listens once it runs", () => {
    handleServerConnect("apiMock", declared as never);

    handleServerConnect("apiMock", {
      ...declared,
      port: 56214,
      url: "http://localhost:56214",
      processStatus: "running",
    } as never);

    const server = useMockStore.getState().servers.apiMock;
    expect(server).toMatchObject({ port: 56214, url: "http://localhost:56214", processStatus: "running" });
  });

  it("shows why it crashed", () => {
    handleServerConnect("apiMock", declared as never);

    handleServerConnect("apiMock", {
      ...declared,
      processStatus: "crashed",
      lastError: "Cannot find package '@hono/node-server'",
    } as never);

    expect(useMockStore.getState().servers.apiMock?.lastError).toBe("Cannot find package '@hono/node-server'");
  });

  it("keeps its request and error counts through a state update that carries none", () => {
    handleServerConnect("apiMock", { ...declared, processStatus: "running" } as never);
    useMockStore.getState().updateServer("apiMock", { requestsServed: 12, errorCount: 3 });

    handleServerConnect("apiMock", { ...declared, processStatus: "running" } as never);

    expect(useMockStore.getState().servers.apiMock).toMatchObject({ requestsServed: 12, errorCount: 3 });
  });

  it("leaves the list when the config no longer declares it", () => {
    handleServerConnect("apiMock", declared as never);

    handleMockEvent({ type: "mock:server:disconnect", serverId: "apiMock" } as never);

    expect(useMockStore.getState().servers.apiMock).toBeUndefined();
  });

  it("is kept, marked disconnected, when it is a mock Studio did not start", () => {
    handleServerConnect("external", { ...declared, serverId: "external", managed: false } as never);

    handleMockEvent({ type: "mock:server:disconnect", serverId: "external" } as never);

    expect(useMockStore.getState().servers.external?.status).toBe("disconnected");
  });
});
