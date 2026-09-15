/**
 * Config watcher — observes `nexus.config.ts` and every TypeScript module it
 * transitively imports (the `deps[]` array returned by `loadNexusConfig`).
 *
 * On any change: debounce 100ms → re-`loadNexusConfig` → push the fresh
 * config into the `BindingTable` → emit `config:update` + `binding:snapshot`
 * to the UI. Reload failures are surfaced as `config:error` events while
 * keeping the previously loaded config active.
 *
 * Uses native `fs.watch` (no chokidar) to stay zero-dep. Each dep file is
 * watched individually because the dep set may span unrelated directories
 * (mock modules, sub-package imports, etc.) and a single recursive root
 * watch would over-collect.
 */

import type { FSWatcher } from "node:fs";
import { existsSync, watch as fsWatch } from "node:fs";
import { createLogger } from "@noverax/nexus";
import type { Namespace } from "socket.io";
import type { BindingTable } from "./catalog/binding-table";
import { type LoadedNexusConfig, loadNexusConfig } from "./config-loader";

const log = createLogger("Studio");
const DEBOUNCE_MS = 100;

export interface ConfigWatcherDeps {
  projectRoot: string;
  bindingTable: BindingTable;
  uiNamespace?: Namespace;
  /** Called whenever a fresh config has been successfully loaded. */
  onReload?: (loaded: LoadedNexusConfig) => void;
}

export interface ConfigWatcher {
  /** Stop every fs.watch and cancel any pending debounce timer. */
  stop(): void;
  /** The most recent successfully loaded config — never null after construction. */
  getCurrent(): LoadedNexusConfig;
}

/**
 * Start watching the dep set of an already-loaded config.
 *
 * The caller is responsible for the initial `loadNexusConfig` + first
 * `bindingTable.setConfig` invocation; this function only handles updates.
 * That keeps the startup error path (config not found / invalid) on the
 * synchronous side of `createStudioServer` where it can fail loud.
 */
export function startConfigWatcher(
  initial: LoadedNexusConfig,
  deps: ConfigWatcherDeps,
): ConfigWatcher {
  let current: LoadedNexusConfig = initial;
  const watchers: FSWatcher[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const reload = async (): Promise<void> => {
    try {
      const loaded = await loadNexusConfig(deps.projectRoot);
      current = loaded;
      deps.bindingTable.setConfig(loaded.config);
      deps.onReload?.(loaded);
      if (deps.uiNamespace) {
        deps.uiNamespace.emit("config:update", { configFile: loaded.configFile });
        deps.uiNamespace.emit("binding:snapshot", deps.bindingTable.getStatus());
      }
    } catch (err) {
      log.warn("Failed to reload nexus.config", err);
      if (deps.uiNamespace) {
        deps.uiNamespace.emit("config:error", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  const scheduleReload = (): void => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void reload();
    }, DEBOUNCE_MS);
  };

  for (const dep of initial.deps) {
    if (!existsSync(dep)) continue;
    try {
      const w = fsWatch(dep, { persistent: true }, () => scheduleReload());
      watchers.push(w);
    } catch (err) {
      log.warn(`Failed to watch ${dep}`, err);
    }
  }

  return {
    stop(): void {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      for (const w of watchers) {
        try {
          w.close();
        } catch {
          // best-effort: a watcher may already be closed by the OS
        }
      }
      watchers.length = 0;
    },
    getCurrent(): LoadedNexusConfig {
      return current;
    },
  };
}
