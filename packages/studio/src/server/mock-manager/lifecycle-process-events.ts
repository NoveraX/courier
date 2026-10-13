/**
 * Process-manager event callbacks for the mock lifecycle coordinator.
 *
 * Builds the `ProcessManagerEvents` object the coordinator hands to
 * `createProcessManager`. The callbacks own all the logic for translating
 * raw child-process events into `ServerState` mutations and UI snapshot
 * emissions.
 */

import { createLogger } from "@noverax/courier";
import { describeError } from "../describe-error";
import { isPlainObject } from "../is-plain-object";
import type { MockLog } from "../storage/mock-log";
import { applyWorkerEvent, NO_NETWORK, networkStateOf } from "./apply-worker-event";
import type { ConditionsKeeper } from "./mock-conditions";
import type { ProcessManagerEvents } from "./process-manager";
import type { ServerState } from "./types";

const log = createLogger("Mock");

/** A mock whose process is gone has no pid, and no port or URL of its own. */
const GONE: Partial<ServerState> = { pid: undefined, actualPort: undefined, url: undefined };

export interface ProcessEventsContext {
  servers: Map<string, ServerState>;
  /** The project root, links resolved: what a mock's failure names a path in the project relative to. */
  projectRoot: string;
  /** Tell every page what a worker reported, in one message: each event names its type. */
  emitAll: (events: readonly Record<string, unknown>[]) => void;
  updateAndEmit: (serverId: string, patch: Partial<ServerState>) => void;
  /** Keeps the requests each mock answered, for the pages that connect later. */
  mockLog?: MockLog | undefined;
  /** Ask a mock for its store whole, when Studio's copy fell out of step with it. */
  resendStore: (serverId: string) => void;
  /** Keeps the conditions set on each mock, and sets them again when it starts again. */
  conditions?: ConditionsKeeper | undefined;
}

export function createProcessEvents(ctx: ProcessEventsContext): ProcessManagerEvents {
  const { servers, emitAll, updateAndEmit } = ctx;
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
        declaredNetwork: JSON.stringify(data.network ?? {}),
      });
      ctx.conditions?.restore(serverId);
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
      /* What every page is told, one without the token too: a path in the
         project named from its root, any other from `~`. */
      updateAndEmit(serverId, {
        status: "crashed",
        lastError: describeError(reason, ctx.projectRoot),
      });
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

    /* Every event the worker sends names its type; the pages are sent the
       ones that came together in one message, each as it came, and Studio
       keeps what they changed for pages that connect later. Each is stamped
       once, so a page that reloads is shown each request at the time a page
       was shown it live. */
    onEvents(serverId, events) {
      const shown: Record<string, unknown>[] = [];
      let resend = false;
      for (const event of events) {
        if (typeof event.type !== "string") continue;
        const stamped = { ...event, serverId, timestamp: Date.now() };
        shown.push(stamped);
        ctx.mockLog?.record(stamped);
        const state = servers.get(serverId);
        if (state && !applyWorkerEvent(state, event)) resend = true;
        if (event.type === "mock:network:config" || event.type === "mock:scenario:active") {
          ctx.conditions?.keep(serverId);
        }
      }
      if (shown.length > 0) emitAll(shown);
      if (resend) ctx.resendStore(serverId);
    },
  };
}
