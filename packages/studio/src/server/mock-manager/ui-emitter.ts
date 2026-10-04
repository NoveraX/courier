import type { Namespace, Socket } from "socket.io";

import { emitLiveEvent, emitLiveEventTo } from "../live-events";
import type { ServerState } from "./types";

/** How the mock manager tells the pages about its mocks. */
interface UiEmitter {
  emit(type: string, data: Record<string, unknown>): void;
  /** Tell every page a mock's state. */
  emitServerState(state: ServerState): void;
  /** Tell one page that connects a mock's state. */
  sendServerState(socket: Socket, state: ServerState): void;
}

/** Create a helper that emits mock events to the UI namespace */
export function createUiEmitter(uiNamespace: Namespace): UiEmitter {
  const event = (type: string, data: Record<string, unknown>) => ({
    id: `managed_${Date.now().toString(36)}`,
    type,
    timestamp: Date.now(),
    sessionId: "mock-manager",
    ...data,
  });
  const emit = (type: string, data: Record<string, unknown>) => {
    emitLiveEvent(uiNamespace, event(type, data));
  };

  /* Request and error counts are the UI's own tally of the events it saw, so
     a state update leaves them out rather than resetting them. */
  const emitServerState = (state: ServerState) => {
    emit("mock:server:connect", serverStateData(state));
  };
  /* A page that connects is told the mocks' states; the other pages have them. */
  const sendServerState = (socket: Socket, state: ServerState) => {
    emitLiveEventTo(socket, event("mock:server:connect", serverStateData(state)));
  };

  return { emit, emitServerState, sendServerState };
}

function serverStateData(state: ServerState): Record<string, unknown> {
  return {
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
  };
}
