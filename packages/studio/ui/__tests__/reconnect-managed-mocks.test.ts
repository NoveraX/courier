/**
 * @vitest-environment jsdom
 *
 * On connecting, Studio sends each mock it runs, and the page lists those
 * rather than the mocks it had before the reconnect, so a mock Studio
 * stopped meanwhile leaves the list.
 */
import type { Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";

import { buildBindings } from "@/socket/socket-bindings";
import { useStudioStore } from "@/store";
import { useMockStore } from "@/store/mock-slice";
import type { MockServerInfo } from "@/store/mock-slice-types";

function server(serverId: string, managed: boolean): MockServerInfo {
  return {
    serverId,
    name: serverId,
    port: 7001,
    url: "http://localhost:7001",
    status: "connected",
    startedAt: 0,
    routeCount: 0,
    collectionCount: 0,
    recordCount: 0,
    requestsServed: 0,
    scenarioRequestCount: 0,
    errorCount: 0,
    activeScenario: null,
    availableScenarios: [],
    networkPreset: "none",
    networkConfig: null,
    latencyPreset: "none",
    chaosPreset: "none",
    managed,
    processStatus: "running",
    origin: managed ? "studio" : "external",
    collections: [],
    routes: [],
    scenarios: [],
  };
}

/* A socket that takes listeners and never calls them. */
function idleSocket(): Socket {
  const socket = { on: () => socket, off: () => socket, io: { on: () => undefined } };
  return socket as unknown as Socket;
}

afterEach(() => {
  useMockStore.getState().resetMockState();
});

describe("a page that connects to Studio again", () => {
  it("drops the mocks Studio runs, and keeps the ones it does not", () => {
    const mocks = useMockStore.getState();
    mocks.addServer(server("studio-mock", true));
    mocks.addServer(server("external", false));
    mocks.selectServer("studio-mock");

    buildBindings(idleSocket(), useStudioStore.getState).onConnect();

    const { servers, activeServerId } = useMockStore.getState();
    expect(Object.keys(servers)).toEqual(["external"]);
    expect(activeServerId).toBe("external");
  });
});
