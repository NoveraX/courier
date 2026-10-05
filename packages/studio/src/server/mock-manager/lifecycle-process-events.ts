/**
 * Process-manager event callbacks for the mock lifecycle coordinator.
 *
 * Builds the `ProcessManagerEvents` object the coordinator hands to
 * `createProcessManager`. The callbacks own all the logic for translating
 * raw child-process events into `ServerState` mutations and UI snapshot
 * emissions.
 */

import { createLogger } from "@noverax/courier";
import { isPlainObject } from "../is-plain-object";
import type { MockLog } from "../storage/mock-log";
import { applyWorkerEvent, NO_NETWORK, networkStateOf } from "./apply-worker-event";
import type { ProcessManagerEvents } from "./process-manager";
import type { ServerState } from "./types";

const log = createLogger("Mock");

/** A mock whose process is gone has no pid, and no port or URL of its own. */
const GONE: Partial<ServerState> = { pid: undefined, actualPort: undefined, url: undefined };

export interface ProcessEventsContext {
  servers: Map<string, ServerState>;
  emit: (type: string, payload: Record<string, unknown>) => void;
  updateAndEmit: (serverId: string, patch: Partial<ServerState>) => void;
  /** Keeps the requests each mock answered, for the pages that connect later. */
  mockLog?: MockLog | undefined;
  /** Ask a mock for its store whole, when Studio's copy fell out of step with it. */
  resendStore: (serverId: string) => void;
}

export function createProcessEvents(ctx: ProcessEventsContext): ProcessManagerEvents {
  const { servers, emit, updateAndEmit } = ctx;
  const nameOf = (serverId: string): string => servers.get(serverId)?.name ?? serverId;

  return {
    /* A mock that started again serves the network conditions it starts
       with, not the ones set on the worker that went before; a worker that
       reports none serves none. */
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
        storeSeq: 0,
        scenarios: data.scenarios ?? [],
        activeScenario: null,
        ...(isPlainObject(data.network) ? networkStateOf(data.network) : NO_NETWORK),
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
      /* A message can run over several lines — a module that failed to load
         lists its require stack — so the terminal gets it whole and the UI
         the line that says why. */
      const [reason = message] = message.split("\n", 1);
      updateAndEmit(serverId, { status: "crashed", lastError: reason });
    },

    /* A mock that restarts says so until it starts again: what its worker
       served is gone meanwhile, and the start that follows sends that on. */
    onStopped(serverId) {
      log.info(`[${nameOf(serverId)}] stopped`);
      const state = servers.get(serverId);
      if (state?.status === "restarting") Object.assign(state, GONE);
      else updateAndEmit(serverId, { status: "stopped", ...GONE });
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

    /* Every event the worker sends names its type; the page is sent each one
       as it came, and Studio keeps what it changed for pages that connect
       later. It is stamped once, so a page that reloads is shown each request
       at the time a page was shown it live. */
    onEvent(serverId, event) {
      const { type } = event;
      if (typeof type !== "string") return;
      const shown = { ...event, serverId, timestamp: Date.now() };
      emit(type, shown);
      ctx.mockLog?.record(shown);
      const state = servers.get(serverId);
      if (state && !applyWorkerEvent(state, event)) ctx.resendStore(serverId);
    },
  };
}
