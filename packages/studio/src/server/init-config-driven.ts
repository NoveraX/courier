/**
 * Load `courier.config.ts` if present and start the config watcher.
 *
 * A missing config leaves the binding table empty and other load errors are
 * logged, without crashing startup — and the watcher starts either way, so
 * creating or fixing the config is picked up without a restart. The successful path pushes the
 * loaded config into the binding table + mock registry, then attaches an
 * `onReload` callback so subsequent file changes flow through the same path.
 */

import { createLogger } from "@noverax/courier";
import type { Namespace } from "socket.io";
import type { BindingTable } from "./catalog/binding-table";
import { type LoadedCourierConfig, loadCourierConfig } from "./config-loader";
import { ConfigNotFoundError } from "./config-loader-errors";
import { type ConfigWatcher, startConfigWatcher } from "./config-watcher";
import type { MockRegistry } from "./mock-registry";
import { recordStartupIssue } from "./startup-issues";
import type { WatcherStatus } from "./watcher-status";

const log = createLogger("Studio");

export interface InitConfigDrivenDeps {
  projectRoot: string;
  bindingTable: BindingTable;
  mockRegistry: MockRegistry;
  uiNamespace: Namespace;
  watcherStatus: WatcherStatus;
  setConfigPath: (path: string) => void;
}

export async function initConfigDriven(deps: InitConfigDrivenDeps): Promise<ConfigWatcher> {
  const { projectRoot, bindingTable, mockRegistry, uiNamespace, watcherStatus, setConfigPath } =
    deps;

  let loaded: LoadedCourierConfig | null = null;
  try {
    loaded = await loadCourierConfig(projectRoot);
  } catch (err) {
    if (!(err instanceof ConfigNotFoundError)) {
      /* Recorded as well as logged: without a config there is no binding
         table, and the banner that follows would otherwise present that as
         a normal start. The watcher below still starts, so the fix is
         picked up when it is saved. */
      log.warn("courier.config load failed", err);
      recordStartupIssue("courier.config did not load, so no sources are bound", err);
    }
  }

  if (loaded) {
    setConfigPath(loaded.configFile);
    bindingTable.setConfig(loaded.config);
    mockRegistry.syncFromConfig(loaded.config);
    uiNamespace.emit("config:update", { configFile: loaded.configFile });
    uiNamespace.emit("binding:snapshot", bindingTable.getStatus());
  }

  return startConfigWatcher(loaded, {
    projectRoot,
    bindingTable,
    uiNamespace,
    watcherStatus,
    onReload: (next) => {
      setConfigPath(next.configFile);
      mockRegistry.syncFromConfig(next.config);
    },
  });
}
