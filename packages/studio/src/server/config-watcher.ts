/**
 * Config watcher — observes `courier.config.ts`, `courier.mocks.ts` and every
 * module they transitively import (the `deps[]` array returned by
 * `loadCourierConfig`).
 *
 * On any change: debounce → queue a reload → re-`loadCourierConfig` → push
 * the fresh config into the `BindingTable` and its mocks into the mock
 * manager → emit `config:update` + `binding:snapshot` to the UI. Reloads run
 * one at a time, in order. Reload failures are surfaced as `config:error`
 * while the previously loaded config stays active.
 *
 * The dep set is re-derived by every reload and handed straight back to the
 * watch set, so a module the config has only just started importing is watched
 * from that moment rather than from the next server start.
 */

import { join } from "node:path";
import { createLogger } from "@noverax/courier";
import { CONFIG_BASENAMES } from "@noverax/courier-studio-core/config";
import type { Namespace } from "socket.io";
import type { BindingTable } from "./catalog/binding-table";
import { type LoadedCourierConfig, loadCourierConfig } from "./config-loader";
import { type ExclusiveTransaction, exclusiveContext } from "./exclusive-reload";
import { createReloadQueue } from "./reload-queue";
import { scanProjectSources } from "./scan-project-sources";
import { createWatchSet, type WatchDegradation } from "./watch-set";
import type { WatcherStatus } from "./watcher-status";

const log = createLogger("Studio");

export interface ConfigWatcherDeps {
  projectRoot: string;
  bindingTable: BindingTable;
  uiNamespace?: Namespace;
  /** Reports the tracked dep count and each change to the UI. */
  watcherStatus?: WatcherStatus;
  /** Called whenever a fresh config has been successfully loaded. */
  onReload?: (loaded: LoadedCourierConfig) => void;
  /** Why the load before the watcher started failed; reported until one succeeds. */
  initialError?: unknown;
}

export interface ConfigWatcher {
  /** Release every watch and cancel any pending debounce timer. */
  stop(): void;
  /** The config last loaded — none while there has not been one that loads. */
  getCurrent(): LoadedCourierConfig | null;
  /** Why the last attempt to load the config failed; `null` once one succeeds. */
  lastLoadError(): unknown;
  /** Resolves once no reload is queued or running. */
  settled(): Promise<void>;
  /** Resolves once no edit run with `runExclusive` is queued or running. */
  editsSettled(): Promise<void>;
  /**
   * Run an edit of the watched files alone on the reload chain: reloads
   * queued before it run first, and those its own writes or anyone else's
   * trigger meanwhile run after it. Studio changes only through the
   * context's `apply`, so a transaction that does not apply leaves it as it was.
   *
   * @param transaction - The edit
   * @param timeoutMs - How long one `load` inside it may take
   * @param dropped - Aborted when the caller gave up before the edit started; it then no longer counts as under way
   */
  runExclusive<TResult>(
    transaction: ExclusiveTransaction<TResult>,
    timeoutMs: number,
    dropped?: AbortSignal,
  ): Promise<TResult>;
}

/** A refused watch leaves the poll layer running, so say so rather than throw. */
function reportDegradation({ kind, path, message }: WatchDegradation): void {
  const advice =
    kind === "limit" ? " Raise fs.inotify.max_user_watches to restore native notifications." : "";
  log.warn(`Cannot watch ${path}: ${message}. Falling back to polling it.${advice}`);
}

/**
 * Watch the config, the mocks file and every module they import, and reload
 * on each change.
 *
 * The caller loads once before starting it and passes the result — or,
 * through `deps.initialError`, why it failed. With no config loaded, none yet
 * or one that failed, every name a config may take is watched, so creating
 * or fixing it is picked up without a restart.
 */
export function startConfigWatcher(
  initial: LoadedCourierConfig | null,
  deps: ConfigWatcherDeps,
): ConfigWatcher {
  let current: LoadedCourierConfig | null = initial;
  let lastError: unknown = initial ? null : (deps.initialError ?? null);
  let stopped = false;

  const paths = initial?.deps ?? CONFIG_BASENAMES.map((name) => join(deps.projectRoot, name));
  const queue = createReloadQueue(reload);
  const watchSet = createWatchSet({
    paths,
    onChange: (changed) => queue.request(changed),
    onDegraded: reportDegradation,
  });
  deps.watcherStatus?.setApiPathCount(paths.length);

  function apply(loaded: LoadedCourierConfig): void {
    current = loaded;
    lastError = null;
    watchSet.update(loaded.deps);
    deps.watcherStatus?.setApiPathCount(loaded.deps.length);
    deps.bindingTable.setConfig(loaded.config);
    deps.onReload?.(loaded);
    if (deps.uiNamespace) announce(deps.uiNamespace, loaded, deps.bindingTable);
  }

  async function reload(changed: string[]): Promise<void> {
    if (stopped) return;
    deps.watcherStatus?.emitChange("api", changed);
    try {
      const loaded = await loadCourierConfig(deps.projectRoot);
      /* A stop between the change and the load resolving must not push a
         config into a server that has already torn its state down. */
      if (!stopped) apply(loaded);
    } catch (err) {
      if (stopped) return;
      lastError = err;
      log.warn("Failed to reload courier.config", err);
      deps.uiNamespace?.emit("config:error", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const host = {
    current: () => current,
    load: () => loadCourierConfig(deps.projectRoot),
    apply,
    acknowledge: (acknowledged: readonly string[]) => {
      watchSet.acknowledge(acknowledged);
      queue.forget(acknowledged);
    },
    reloadAfter: (paths: readonly string[]) => queue.request(paths),
    isStopped: () => stopped,
  };

  return {
    stop(): void {
      stopped = true;
      watchSet.stop();
    },
    getCurrent: () => current,
    lastLoadError: () => lastError,
    settled: queue.settled,
    editsSettled: queue.exclusiveSettled,
    runExclusive: (transaction, timeoutMs, dropped) =>
      queue.exclusive(() => transaction(exclusiveContext(host, timeoutMs)), dropped),
  };
}

function announce(ui: Namespace, loaded: LoadedCourierConfig, bindingTable: BindingTable): void {
  ui.emit("config:update", { configFile: loaded.configFile });
  /* Sources may have been added, renamed or removed by that edit. */
  scanProjectSources()
    .then((scan) => ui.emit("scan:sources", scan))
    .catch((err: unknown) => log.warn("Failed to rescan sources after config change", err));
  ui.emit("binding:snapshot", bindingTable.getStatus());
}
