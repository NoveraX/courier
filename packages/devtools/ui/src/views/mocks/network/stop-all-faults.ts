import { getSocket } from "@/socket";
import { useMockStore } from "@/store/mock-slice";

/** Reset all network fault injection for a given server. */
export function stopAllFaults(serverId: string): void {
  useMockStore.getState().updateServer(serverId, {
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
    config: { latency: 0, bandwidth: 0 },
    preset: "none",
  });
  socket.emit("mock:command", {
    action: "mock:chaos:set",
    serverId,
    config: { errorRate: 0, faultWeights: [] },
    preset: "none",
  });
}
