/**
 * Lower-frequency control-plane emitters: scenario activation,
 * route list refresh, network config changes, experiment events,
 * and hot-reload notifications.
 */

import type { BridgeContext } from "../types";
import { buildScenarioEntries } from "./snapshot-emitters";
import type { EmitFn } from "./types";

export function createControlEmitters(emit: EmitFn, ctx: BridgeContext) {
  return {
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
