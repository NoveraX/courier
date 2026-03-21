import type { BridgeContext } from "./types";

interface Socket {
  emit(event: string, data: unknown): void;
}

/** Creates an event emitter that sends mock:* events via Socket.IO */
export function createEventEmitter(socket: Socket, ctx: BridgeContext) {
  const emit = (type: string, payload: Record<string, unknown>) => {
    socket.emit("event", {
      id: `${ctx.sessionId}_${Date.now().toString(36)}`,
      type,
      timestamp: Date.now(),
      sessionId: ctx.sessionId,
      serverId: ctx.serverId,
      ...payload,
    });
  };

  return {
    /** Full snapshot — sent on (re)connect only */
    emitConnect() {
      const store = ctx.server.store;
      const collections = store.list();
      const recordCount = collections.reduce(
        (sum, name) => sum + store.collection(name).count(),
        0,
      );

      emit("mock:server:connect", {
        name: ctx.name,
        port: ctx.port,
        url: ctx.url,
        startedAt: ctx.startedAt,
        routeCount: ctx.routeCount,
        collectionCount: collections.length,
        recordCount,
        requestsServed: ctx.requestCounter,
        errorCount: ctx.server.history.filter((h) => h.error).length,
        activeScenario: ctx.activeScenario,
        availableScenarios: ctx.availableScenarios,
        collections: collections.map((name) => ({
          name,
          count: store.collection(name).count(),
          records: [],
        })),
        routes: ctx.routes,
      });
    },

    emitDisconnect() {
      emit("mock:server:disconnect", {});
    },

    /** Pushed after each request completes — keeps counters in sync */
    emitRequestStart(
      requestId: string,
      httpMethod: string,
      path: string,
      group: string,
      endpoint: string,
      variables?: unknown,
    ) {
      ctx.requestCounter++;
      emit("mock:request:start", { requestId, httpMethod, path, group, endpoint, variables });
    },

    emitRequestEnd(
      requestId: string,
      status: number,
      data: unknown,
      duration: number,
      latencyInjected: number,
      scenarioState: string,
    ) {
      emit("mock:request:end", {
        requestId,
        status,
        data,
        duration,
        latencyInjected,
        scenarioState,
      });
    },

    emitRequestError(requestId: string, status: number, message: string, duration: number) {
      emit("mock:request:error", { requestId, status, message, duration });
    },

    emitStoreChange(
      collection: string,
      operation: "create" | "update" | "delete" | "seed" | "clear",
      record: unknown,
      count: number,
    ) {
      emit("mock:store:change", { collection, operation, record, count });
    },

    emitStoreSnapshot() {
      const store = ctx.server.store;
      const collections = store.list().map((name) => ({
        name,
        count: store.collection(name).count(),
        records: store.collection(name).getAll(),
      }));
      emit("mock:store:snapshot", { collections });
    },

    emitScenarioActive(
      scenario: string,
      available: Array<{ name: string; endpointCount: number; isActive: boolean }>,
    ) {
      emit("mock:scenario:active", { scenario, available });
    },

    emitRouteList(routes: Array<Record<string, unknown>>) {
      emit("mock:route:list", { routes });
    },

    emitNetworkConfig(config: Record<string, unknown>) {
      emit("mock:network:config", { config });
    },

    emitHotReload(files: string[], routesChanged: number) {
      emit("mock:hotreload", { files, routesChanged });
    },
  };
}

/** Return type of createEventEmitter */
export type MockEventEmitter = ReturnType<typeof createEventEmitter>;
