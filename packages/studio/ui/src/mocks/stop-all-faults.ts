import { routeOverridesOf } from "@/features/mocks/route-overrides";
import { getSocket } from "@/socket";
import type { MockServerInfo, NetworkConfig } from "@/store/mock-slice";
import { useMockStore } from "@/store/mock-slice";

/**
 * Stop everything the mock simulates: its chaos, its delay, its bandwidth
 * cap, its upload conditions, and every route override, which the mock
 * keeps switched off with its settings — as a halt leaves them — so a
 * route can be switched back on as it was.
 *
 * @param server - The mock server
 * @example
 * ```ts
 * stopAllFaults(server);
 * ```
 */
export function stopAllFaults(server: MockServerInfo): void {
  const { serverId } = server;
  const routeOverrides = routeOverridesOf(server).map((override) => ({
    ...override,
    enabled: false,
  }));
  const stopped = { latency: 0, bandwidth: 0, uploads: {}, routeOverrides };
  const networkConfig: NetworkConfig = {
    ...server.networkConfig,
    ...stopped,
    errorRate: 0,
    faultWeights: [],
  };
  useMockStore.getState().updateServer(serverId, {
    latencyPreset: "none",
    latencyStartedAt: null,
    chaosPreset: "none",
    chaosStartedAt: null,
    networkConfig,
  });

  const socket = getSocket();

  // Two separate commands so each gets its own experiment transition event
  socket.emit("mock:command", {
    action: "mock:network:set",
    serverId,
    config: stopped,
    preset: "none",
  });
  socket.emit("mock:command", {
    action: "mock:chaos:set",
    serverId,
    config: { errorRate: 0, faultWeights: [] },
    preset: "none",
  });
}
