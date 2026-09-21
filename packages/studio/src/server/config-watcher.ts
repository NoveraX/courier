/**
 * Config watcher — observes `courier.config.ts` and every TypeScript module it
 * transitively imports (the `deps[]` array returned by `loadCourierConfig`).
 *
 * On any change: debounce → re-`loadCourierConfig` → push the fresh config
 * into the `BindingTable` → emit `config:update` + `binding:snapshot` to the
 * UI. Reload failures are surfaced as `config:error` while the previously
 * loaded config stays active.
 *
 * The dep set is re-derived by every reload and handed straight back to the
 * watch set, so a module the config has only just started importing is watched
 * from that moment rather than from the next server start.
 */

import { createLogger } from "@noverax/courier";
import type { Namespace } from "socket.io";
import type { BindingTable } from "./catalog/binding-table";
import { type LoadedCourierConfig, loadCourierConfig } from "./config-loader";
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
}

export interface ConfigWatcher {
  /** Release every watch and cancel any pending debounce timer. */
  stop(): void;
  /** The most recent successfully loaded config — never null after construction. */
  getCurrent(): LoadedCourierConfig;
}

/** A refused watch leaves the poll layer running, so say so rather than throw. */
function reportDegradation({ kind, path, message }: WatchDegradation): void {
  const advice =
    kind === "limit" ? " Raise fs.inotify.max_user_watches to restore native notifications." : "";
  log.warn(`Cannot watch ${path}: ${message}. Falling back to polling it.${advice}`);
}

/**
 * Start watching the dep set of an already-loaded config.
 *
 * The caller is responsible for the initial `loadCourierConfig` + first
 * `bindingTable.setConfig` invocation; this function only handles updates.
 * That keeps the startup error path (config not found / invalid) on the
 * synchronous side of `createStudioServer` where it can fail loud.
 */
export function startConfigWatcher(
  initial: LoadedCourierConfig,
  deps: ConfigWatcherDeps,
): ConfigWatcher {
  let current: LoadedCourierConfig = initial;
  let stopped = false;

  const watchSet = createWatchSet({
    paths: initial.deps,
    onChange: (changed) => void reload(changed),
    onDegraded: reportDegradation,
  });
  deps.watcherStatus?.setApiPathCount(initial.deps.length);

  async function reload(changed: string[]): Promise<void> {
    deps.watcherStatus?.emitChange("api", changed);
    try {
      const loaded = await loadCourierConfig(deps.projectRoot);
      /* A stop between the change and the load resolving must not push a
         config into a server that has already torn its state down. */
      if (stopped) return;
      current = loaded;
      watchSet.update(loaded.deps);
      deps.watcherStatus?.setApiPathCount(loaded.deps.length);
      deps.bindingTable.setConfig(loaded.config);
      deps.onReload?.(loaded);
      if (deps.uiNamespace) {
        deps.uiNamespace.emit("config:update", { configFile: loaded.configFile });
        deps.uiNamespace.emit("binding:snapshot", deps.bindingTable.getStatus());
      }
    } catch (err) {
      if (stopped) return;
      log.warn("Failed to reload courier.config", err);
      deps.uiNamespace?.emit("config:error", {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    stop(): void {
      stopped = true;
      watchSet.stop();
    },
    getCurrent(): LoadedCourierConfig {
      return current;
    },
  };
}
