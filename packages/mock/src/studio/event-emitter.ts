import type { RouteInfo } from "../auto/route-analyzer";
import { introspectScenario } from "../auto/scenario-introspect";
import type { BridgeContext } from "./types";

interface Socket {
  emit(event: string, data: unknown): void;
}

function buildScenarioEntries(ctx: BridgeContext, routes: RouteInfo[]) {
  return ctx.availableScenarios.map((name) => {
    const scenario = ctx.scenarioMap[name];
    const result = scenario
      ? introspectScenario(scenario, routes)
      : { endpoints: [], stateTransitions: [], hasStateMachine: false };
    return {
      name,
      description: scenario?.description,
      tags: scenario?.tags,
      endpointCount: result.endpoints.length,
      isActive: name === ctx.activeScenario,
      hasStateMachine: result.hasStateMachine,
      stateTransitions: result.stateTransitions,
      endpoints: result.endpoints,
    };
  });
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
      const scenarios = buildScenarioEntries(ctx, ctx.analyzedRoutes);

      emit("mock:server:connect", {
        name: ctx.name,
        port: ctx.port,
        url: ctx.url,
        startedAt: ctx.startedAt,
        routeCount: ctx.routeCount,
        collectionCount: collections.length,
        recordCount,
        requestsServed: ctx.requestCounter,
        scenarioRequestCount: ctx.scenarioRequestCount,
        errorCount: ctx.server.history.filter((h) => h.error).length,
        activeScenario: ctx.activeScenario,
        availableScenarios: ctx.availableScenarios,
        scenarios,
        collections: collections.map((name) => ({
          name,
          count: store.collection(name).count(),
          records: store.collection(name).getAll(),
        })),
        routes: ctx.routes,
        networkConfig: ctx.server.networkState.getGlobalConfig() ?? null,
        latencyPreset: ctx.server.networkState.latencyPreset,
        latencyStartedAt: ctx.server.networkState.latencyStartedAt,
        chaosPreset: ctx.server.networkState.chaosPreset,
        chaosStartedAt: ctx.server.networkState.chaosStartedAt,
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
      requestHeaders?: Record<string, string>,
    ) {
      ctx.requestCounter++;
      ctx.scenarioRequestCount++;
      emit("mock:request:start", {
        requestId,
        httpMethod,
        path,
        group,
        endpoint,
        variables,
        requestHeaders,
      });
    },

    emitRequestEnd(
      requestId: string,
      status: number,
      data: unknown,
      duration: number,
      latencyInjected: number,
      scenarioState: string,
      responseHeaders?: Record<string, string>,
    ) {
      emit("mock:request:end", {
        requestId,
        status,
        data,
        duration,
        latencyInjected,
        scenarioState,
        responseHeaders,
        scenarioRequestCount: ctx.scenarioRequestCount,
      });
    },

    emitRequestError(requestId: string, status: number, message: string, duration: number) {
      ctx.scenarioRequestCount++;
      emit("mock:request:error", {
        requestId,
        status,
        message,
        duration,
        scenarioRequestCount: ctx.scenarioRequestCount,
      });
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

    /** Push updated scenario list after activation — marks new active, resets per-scenario counter */
    emitScenarioActive(activeScenario: string) {
      ctx.scenarioRequestCount = 0;
      const scenarios = buildScenarioEntries({ ...ctx, activeScenario }, ctx.analyzedRoutes);
      emit("mock:scenario:active", {
        scenario: activeScenario,
        scenarios,
        scenarioRequestCount: 0,
      });
    },

    emitRouteList(routes: Array<Record<string, unknown>>) {
      emit("mock:route:list", { routes });
    },

    emitNetworkConfig(config: Record<string, unknown>) {
      emit("mock:network:config", { config });
    },

    emitExperimentEvent(event: Record<string, unknown>) {
      emit("mock:experiment:event", event);
    },

    emitHotReload(files: string[], routesChanged: number) {
      emit("mock:hotreload", { files, routesChanged });
    },
  };
}

/** Return type of createEventEmitter */
export type MockEventEmitter = ReturnType<typeof createEventEmitter>;
