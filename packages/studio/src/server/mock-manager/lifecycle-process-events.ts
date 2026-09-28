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

/** A mock whose process is gone has no pid, and no port or URL of its own. */
const GONE: Partial<ServerState> = { pid: undefined, actualPort: undefined, url: undefined };

export interface ProcessEventsContext {
  servers: Map<string, ServerState>;
  emit: (type: string, payload: Record<string, unknown>) => void;
  updateAndEmit: (serverId: string, patch: Partial<ServerState>) => void;
}

export function createProcessEvents(ctx: ProcessEventsContext): ProcessManagerEvents {
  const { servers, emit, updateAndEmit } = ctx;
  const nameOf = (serverId: string): string => servers.get(serverId)?.name ?? serverId;

  return {
    onReady(serverId, data) {
      const name = nameOf(serverId);
      log.info(`[${name}] ready at ${data.url}`);
      updateAndEmit(serverId, {
        status: "running",
        lastError: undefined,
        actualPort: data.port,
        url: data.url,
        startedAt: Date.now(),
        routes: data.routes,
        collections: data.collections,
        scenarios: data.scenarios ?? [],
        activeScenario: null,
      });
    },

    /* Every failure is said where the developer is looking — the terminal —
       and kept on the mock for the UI, so a mock that could not start says
       why. */
    onError(serverId, message, fatal) {
      const name = nameOf(serverId);
      if (!fatal) {
        log.warn(`[${name}] ${message}`);
        return;
      }
      log.error(`[${name}] failed: ${message}`);
      /* A worker reports a thrown error with its stack, for the terminal; the UI shows why, not where. */
      const [reason = message] = message.split("\n", 1);
      updateAndEmit(serverId, { status: "crashed", lastError: reason });
    },

    onStopped(serverId) {
      log.info(`[${nameOf(serverId)}] stopped`);
      updateAndEmit(serverId, { status: "stopped", ...GONE });
    },

    /* A reason the worker reported before it died is the better one; the exit
       itself only says how it ended. */
    onExited(serverId, reason) {
      const state = servers.get(serverId);
      if (state?.status === "crashed" && state.lastError) {
        updateAndEmit(serverId, GONE);
        return;
      }
      log.error(`[${nameOf(serverId)}] ${reason}`);
      updateAndEmit(serverId, { status: "crashed", lastError: reason, ...GONE });
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
