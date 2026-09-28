import type { Namespace } from "socket.io";

import { emitLiveEvent } from "../live-events";
import type { ServerState } from "./types";

/** Create a helper that emits mock events to the UI namespace */
export function createUiEmitter(uiNamespace: Namespace) {
  const emit = (type: string, data: Record<string, unknown>) => {
    emitLiveEvent(uiNamespace, {
      id: `managed_${Date.now().toString(36)}`,
      type,
      timestamp: Date.now(),
      sessionId: "mock-manager",
      ...data,
    });
  };

  /* Request and error counts are the UI's own tally of the events it saw, so
     a state update leaves them out rather than resetting them. */
  const emitServerState = (state: ServerState) => {
    emit("mock:server:connect", {
      serverId: state.serverId,
      name: state.name,
      port: state.actualPort ?? state.configuredPort,
      url: state.url ?? "",
      startedAt: state.startedAt ?? 0,
      routeCount: state.routes.length,
      collectionCount: state.collections.length,
      recordCount: state.collections.reduce((sum, c) => sum + c.count, 0),
      activeScenario: state.activeScenario ?? null,
      availableScenarios: state.scenarios.map((s) => s.name),
      scenarios: state.scenarios,
      collections: state.collections.map((c) => ({
        name: c.name,
        count: c.count,
        records: c.records ?? [],
      })),
      routes: state.routes,
      managed: true,
      processStatus: state.status,
      lastError: state.lastError ?? null,
      origin: state.origin,
      filePath: state.relativePath,
      networkConfig: state.networkConfig ?? null,
      latencyPreset: state.latencyPreset ?? "none",
      latencyStartedAt: state.latencyStartedAt ?? null,
      chaosPreset: state.chaosPreset ?? "none",
      chaosStartedAt: state.chaosStartedAt ?? null,
    });
  };

  return { emit, emitServerState };
}

export type UiEmitter = ReturnType<typeof createUiEmitter>;
