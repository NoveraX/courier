import { basename } from "node:path";
import { createLogger } from "@noverax/courier";
import { unknownConfigKeys } from "@noverax/courier-studio-core/config";
import type { Namespace } from "socket.io";
import { applyLoadedMocks, type MocksConsumers } from "../apply-loaded-mocks";
import { buildBindingSnapshot } from "../binding-snapshot";
import type { BindingTable } from "../catalog/binding-table";
import type { LoadedCourierConfig } from "../config-loader";
import { recordStartupIssue } from "../startup-issues";
import { failureOf } from "./failure-of";
import { sendProject } from "./send-project";
import type { ConfigFailure, ProjectSnapshot } from "./types";

const log = createLogger("Studio");

/** What applying an outcome changes and who is told. */
export interface ProjectOutcomeDeps {
  /** The project root, symlinks resolved. */
  root: string;
  bindingTable: BindingTable;
  uiNamespace: Namespace;
  mocks: MocksConsumers;
}

/** Where the project's snapshot is kept. */
export interface ProjectStore {
  snapshot(): ProjectSnapshot;
  commit(next: ProjectSnapshot): void;
}

/** The two outcomes of a load, applied in the order the loads ran. */
export interface ProjectOutcomes {
  /**
   * A load succeeded: Studio runs it from now on. A config the binding table
   * refuses is applied as a failure instead, and Studio keeps running what it ran.
   */
  applied(loaded: LoadedCourierConfig): void;
  /** A load failed: Studio keeps running what it ran. */
  failed(error: unknown): void;
}

/**
 * Apply each outcome of a load: the binding table and the mocks first, then
 * the snapshot, then every UI is told. Each runs synchronously, so what the
 * UI is sent is exactly the result that was applied.
 *
 * Every outcome reaches the snapshot and the UI, whatever applying it
 * throws. A config the binding table refuses leaves the table as it was, so
 * that load is a failure like any other and Studio keeps running what it
 * ran; mocks that cannot be handed over are logged, and the config they came
 * with still runs. A problem at start is recorded for the banner only once
 * the outcome has been told.
 *
 * @param deps - What an outcome changes, and the UI namespace
 * @param store - Where the snapshot is kept
 * @returns The outcome handlers the reload chain calls
 *
 * @example
 * ```ts
 * const outcomes = createProjectOutcomes({ root, bindingTable, uiNamespace, mocks }, store);
 * outcomes.applied(await loadCourierConfig(root));
 * ```
 */
export function createProjectOutcomes(
  deps: ProjectOutcomeDeps,
  store: ProjectStore,
): ProjectOutcomes {
  function applied(loaded: LoadedCourierConfig): void {
    const previous = store.snapshot();
    if (!bound(loaded)) return;
    warnUnread(loaded);
    runMocks(loaded);
    const next: ProjectSnapshot = {
      revision: previous.revision + 1,
      starting: false,
      running: loaded,
      loadedAt: Date.now(),
      failure: null,
    };
    store.commit(next);
    sendProject(deps.uiNamespace, next, deps.root);
    deps.uiNamespace.emit("binding:snapshot", buildBindingSnapshot(deps.bindingTable));
    if (previous.starting && loaded.mocks.error !== null) {
      recordStartupIssue(
        "courier.mocks.ts did not load, so no mocks are declared",
        loaded.mocks.error,
      );
    }
  }

  /* The table is replaced only once it is built: when building it throws,
     it still holds what Studio ran, and the load is a failure like any other. */
  function bound(loaded: LoadedCourierConfig): boolean {
    try {
      deps.bindingTable.setConfig(loaded.config);
      return true;
    } catch (err) {
      failed(err);
      return false;
    }
  }

  function runMocks({ mocks }: LoadedCourierConfig): void {
    try {
      applyLoadedMocks(mocks, deps.mocks, deps.root);
    } catch (err) {
      log.error(`Studio could not run the mocks of ${mocks.file ?? "courier.mocks.ts"}`, err);
    }
  }

  function failed(error: unknown): void {
    const previous = store.snapshot();
    const failure = failureOf(error, deps.root);
    report(failure, previous);
    const next: ProjectSnapshot = {
      ...previous,
      revision: previous.revision + 1,
      starting: false,
      failure,
    };
    store.commit(next);
    sendProject(deps.uiNamespace, next, deps.root);
    if (previous.starting && failure.code !== "CONFIG_NOT_FOUND") {
      /* Recorded as well as logged: the banner clears the terminal, and
         without a config there is nothing bound to show why. */
      recordStartupIssue("courier.config did not load, so no sources are bound", error);
    }
  }

  return { applied, failed };
}

/* A key Courier does not read is most likely misspelt, and was ignored in silence. */
function warnUnread({ config, configFile }: LoadedCourierConfig): void {
  const unread = unknownConfigKeys(config);
  if (unread.length === 0) return;
  log.warn(
    `${basename(configFile)} has keys Courier does not read: ${unread.join(", ")}; check their spelling`,
  );
}

/* A project without a config is normal at startup; one deleted while Studio
   runs it is said once, and every other failure each time — in one line, as
   the UI says it, with the error whole at debug level. A failure that is not
   the loader's report of the project is Studio's own, and keeps its stack. */
function report(failure: ConfigFailure, previous: ProjectSnapshot): void {
  if (failure.code === "UNKNOWN") {
    log.warn("Failed to load courier.config", failure.cause);
    return;
  }
  if (failure.code !== "CONFIG_NOT_FOUND") {
    log.warn(`courier.config did not load: ${failure.message}`);
    log.debug("courier.config did not load", failure.cause);
    return;
  }
  if (previous.running && previous.failure?.code !== "CONFIG_NOT_FOUND") {
    log.warn("courier.config was deleted; Studio keeps running what it loaded until it is back");
    return;
  }
  log.debug(failure.message);
}
