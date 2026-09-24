/**
 * Process-manager event callbacks for the mock lifecycle coordinator.
 *
 * Builds the `ProcessManagerEvents` object the coordinator hands to
 * `createProcessManager`. The callbacks own all the logic for translating
 * raw child-process events into `ServerState` mutations and UI snapshot
 * emissions.
 */

import { createLogger } from "@noverax/courier";
import type { ProcessManagerEvents } from "./process-manager";
import type { ServerState } from "./types";

const log = createLogger("Mock");

export interface ProcessEventsContext {
  servers: Map<string, ServerState>;
  emit: (type: string, payload: Record<string, unknown>) => void;
  updateAndEmit: (serverId: string, patch: Partial<ServerState>) => void;
}

export function createProcessEvents(ctx: ProcessEventsContext): ProcessManagerEvents {
  const { servers, emit, updateAndEmit } = ctx;

  return {
    onReady(serverId, data) {
      const name = servers.get(serverId)?.name ?? serverId;
      log.info(`[${name}] ready at ${data.url}`);
      updateAndEmit(serverId, {
        status: "running",
        actualPort: data.port,
        url: data.url,
        startedAt: Date.now(),
        routes: data.routes,
        collections: data.collections,
        scenarios: data.scenarios ?? [],
        activeScenario: null,
      });
    },

    onError(serverId, message, fatal) {
      if (fatal) updateAndEmit(serverId, { status: "crashed", lastError: message });
    },

    onStopped(serverId) {
      const name = servers.get(serverId)?.name ?? serverId;
      log.info(`[${name}] stopped`);
      updateAndEmit(serverId, { status: "stopped", pid: undefined });
    },

    onCrashed(serverId, code) {
      updateAndEmit(serverId, {
        status: "crashed",
        lastError: `Process exited with code ${code}`,
        pid: undefined,
      });
    },

    onEvent(serverId, event) {
      emit(event.type as string, { ...event, serverId });

      const state = servers.get(serverId);
      if (!state) return;

      if (event.type === "mock:store:snapshot") {
        state.collections = (event.collections as ServerState["collections"]) ?? state.collections;
      }

      // Keep activeScenario in sync so sendSnapshot() reflects the current state.
      if (event.type === "mock:scenario:active") {
        state.activeScenario = (event.scenario as string) ?? state.activeScenario;
        if (Array.isArray(event.scenarios)) {
          state.scenarios = event.scenarios as ServerState["scenarios"];
        }
        if (Array.isArray(event.routes)) {
          state.routes = event.routes as ServerState["routes"];
        }
      }

      // Keep network presets in sync so sendSnapshot() restores them on UI reconnect.
      if (event.type === "mock:network:config") {
        const cfg = event.config as Record<string, unknown> | undefined;
        if (cfg) {
          state.latencyPreset = cfg.latencyPreset as string | undefined;
          state.latencyStartedAt = cfg.latencyStartedAt as number | null | undefined;
          state.chaosPreset = cfg.chaosPreset as string | undefined;
          state.chaosStartedAt = cfg.chaosStartedAt as number | null | undefined;
          state.networkConfig = cfg;
        }
      }
    },
  };
}
