import { routeOverridesOf } from "@/features/mocks/route-overrides";
import { getSocket } from "@/socket";
import type { MockServerInfo } from "@/store/mock-slice";
import { useMockStore } from "@/store/mock-slice";

/**
 * Stop everything the mock simulates: its chaos, its delay, its bandwidth
 * cap, its upload conditions, and every route override, which keeps its
 * values but is switched off.
 *
 * @param server - The mock server
 * @example
 * ```ts
 * stopAllFaults(server);
 * ```
 */
export function stopAllFaults(server: MockServerInfo): void {
  const { serverId } = server;
  const store = useMockStore.getState();
  for (const override of routeOverridesOf(server)) {
    if (override.enabled) store.setRouteOverride(serverId, { ...override, enabled: false });
  }
  store.updateServer(serverId, {
    latencyPreset: "none",
    latencyStartedAt: null,
    chaosPreset: "none",
    chaosStartedAt: null,
  });

  const socket = getSocket();

  // Two separate commands so each gets its own experiment transition event
  socket.emit("mock:command", {
    action: "mock:network:set",
    serverId,
    config: { latency: 0, bandwidth: 0, uploads: {}, routeOverrides: [] },
    preset: "none",
  });
  socket.emit("mock:command", {
    action: "mock:chaos:set",
    serverId,
    config: { errorRate: 0, faultWeights: [] },
    preset: "none",
  });
}
