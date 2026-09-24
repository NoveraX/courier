import type { Namespace } from "socket.io";
import type { MocksConsumers } from "../apply-loaded-mocks";
import type { BindingTable } from "../catalog/binding-table";
import { startConfigWatcher } from "../config-watcher";
import type { WatcherStatus } from "../watcher-status";
import { withinBudget } from "../within-budget";
import { createProjectOutcomes } from "./project-outcomes";
import type { ProjectSnapshot, ProjectState } from "./types";

/** What owning the project needs from the Studio server. */
export interface ProjectStateDeps {
  /** The project root, symlinks resolved: every path Studio shows is relative to it. */
  projectRoot: string;
  bindingTable: BindingTable;
  uiNamespace: Namespace;
  watcherStatus: WatcherStatus;
  mocks: MocksConsumers;
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
 * load has an outcome the snapshot is `starting`; edits queue behind it.
 *
 * @param deps - The project root and what each outcome changes
 * @returns The project state
 *
 * @example
 * ```ts
 * const project = createProjectState({ projectRoot, bindingTable, uiNamespace, watcherStatus, mocks });
 * project.snapshot().starting; // → true until the first load has an outcome
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

  const engine = startConfigWatcher({
    projectRoot,
    watcherStatus: deps.watcherStatus,
    current: () => current.running,
    onApplied: outcomes.applied,
    onFailed: outcomes.failed,
  });

  return {
    snapshot: () => current,
    settled: engine.settled,
    runExclusive: engine.runExclusive,
    finishEdits: async (budgetMs) => {
      await withinBudget(engine.editsSettled(), budgetMs);
    },
    stop: engine.stop,
  };
}
