import { createLogger } from "@noverax/courier";
import type { CourierConfig } from "@noverax/courier/config";
import type { Namespace } from "socket.io";
import type { MocksConsumers } from "../apply-loaded-mocks";
import type { BindingTable } from "../catalog/binding-table";
import { startConfigWatcher } from "../config-watcher";
import type { WatcherStatus } from "../watcher-status";
import { withinBudget } from "../within-budget";
import { CONFIG_LOAD_TIMEOUT_MS } from "./budgets";
import { insideEdit } from "./inside-edit";
import { createProjectOutcomes } from "./project-outcomes";
import { ProjectStateError } from "./project-state-error";
import { sendImportLists } from "./send-import-lists";
import type { FreshSnapshot, ProjectSnapshot, ProjectState } from "./types";

/** What owning the project needs from the Studio server. */
const log = createLogger("Studio");

export interface ProjectStateDeps {
  /** The project root, symlinks resolved: every path Studio shows is relative to it. */
  projectRoot: string;
  bindingTable: BindingTable;
  uiNamespace: Namespace;
  watcherStatus: WatcherStatus;
  mocks: MocksConsumers;
  /** How long the first load and each reload may take (default: `CONFIG_LOAD_TIMEOUT_MS`). */
  loadTimeoutMs?: number;
  /**
   * Handed the config the first load read — `null` when that load failed —
   * once, before its outcome is applied: what Studio reads from the project
   * only when it starts, its address and where mock ports begin, is taken
   * from it before the first mocks are assigned ports.
   */
  onStartup?: (config: CourierConfig | null) => void;
}

const STARTING: ProjectSnapshot = {
  revision: 0,
  starting: true,
  running: null,
  loadedAt: null,
  failure: null,
};

/**
 * Own the project as Studio runs it: load it on the reload chain, watch it,
 * apply each outcome to the binding table and the mock manager, and tell
 * every UI. Nothing else loads the config for its own use; every reader is
 * served from the snapshot this keeps.
 *
 * It returns at once, and the first load starts on the chain. Until that
 * load has an outcome the snapshot is `starting`; edits queue behind it. A
 * load that takes longer than `loadTimeoutMs` is given up and reported as
 * failed with `CONFIG_LOAD_TIMEOUT`, so Studio is never left starting for
 * good.
 *
 * A reader that must see the saves already on disk, not only those the
 * watcher has reported, asks for `fresh` with a budget: it catches up with
 * the disk first, and answers `settling` when it could not within the budget.
 *
 * @param deps - The project root and what each outcome changes
 * @returns The project state
 *
 * @example
 * ```ts
 * const project = createProjectState({ projectRoot, bindingTable, uiNamespace, watcherStatus, mocks });
 * project.snapshot().starting; // → true until the first load has an outcome
 * const view = await project.fresh(SHOW_BUDGET_MS); // → after the saves on disk now
 * ```
 */
export function createProjectState(deps: ProjectStateDeps): ProjectState {
  const { projectRoot, bindingTable, uiNamespace, mocks } = deps;
  let current = STARTING;
  const store = {
    snapshot: () => current,
    commit: (next: ProjectSnapshot) => {
      current = next;
    },
  };
  const outcomes = createProjectOutcomes(
    { root: projectRoot, bindingTable, uiNamespace, mocks },
    store,
  );

  let startup = deps.onStartup;
  function started(config: CourierConfig | null): void {
    const handler = startup;
    startup = undefined;
    handler?.(config);
  }

  const engine = startConfigWatcher({
    projectRoot,
    watcherStatus: deps.watcherStatus,
    current: () => current.running,
    onApplied: (loaded) => {
      started(loaded.config);
      outcomes.applied(loaded);
    },
    onFailed: (error) => {
      started(null);
      outcomes.failed(error);
    },
    loadTimeoutMs: deps.loadTimeoutMs ?? CONFIG_LOAD_TIMEOUT_MS,
  });

  async function fresh(budgetMs: number): Promise<FreshSnapshot> {
    if (insideEdit.getStore()?.running) throw insideAnEdit();
    /* Awaited before the snapshot is read: read first, it would be the
       project from before the saves this waited for. */
    const catchingUp = engine.catchUp(Date.now() + budgetMs);
    const caughtUp = (await withinBudget(catchingUp, budgetMs)) && (await catchingUp);
    return { ...current, settling: !caughtUp };
  }

  /* The write the route made is done by now; a list that cannot be sent
     must not turn it into a failure, and the next outcome sends it anew. */
  function importsChanged(): void {
    if (current.starting) return;
    try {
      sendImportLists(uiNamespace, current, projectRoot);
    } catch (error) {
      log.warn("Studio could not send the imports lists after an import changed", error);
    }
  }

  return {
    snapshot: () => current,
    fresh,
    importsChanged,
    runExclusive: engine.runExclusive,
    finishEdits: async (budgetMs) => {
      engine.refuseEdits();
      await withinBudget(engine.editsSettled(), budgetMs);
    },
    stop: engine.stop,
  };
}

function insideAnEdit(): ProjectStateError {
  return new ProjectStateError(
    "FRESH_INSIDE_EDIT",
    "An edit asked for the project caught up with the disk, which waits for the edit itself to finish. " +
      "Inside an edit, read what its context lends instead.",
  );
}
