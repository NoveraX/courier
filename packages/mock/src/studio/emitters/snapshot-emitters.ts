/**
 * Connect/disconnect snapshot emitters and the scenario-entry
 * builder used by both connect and scenario-active payloads.
 *
 * Snapshot logic touches the store, scenarios, routes and network
 * state, so it is isolated from the lighter per-event emitters.
 */

import type { RouteInfo } from "../../auto/route-analyzer";
import { introspectScenario } from "../../auto/scenario-introspect";
import type { BridgeContext } from "../types";
import type { EmitFn } from "./types";

export function buildScenarioEntries(ctx: BridgeContext, routes: RouteInfo[]) {
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

export function createSnapshotEmitters(emit: EmitFn, ctx: BridgeContext) {
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
  };
}
